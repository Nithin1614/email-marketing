from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone
from django.utils.html import strip_tags
import logging
import re

logger = logging.getLogger(__name__)


def render_template(template_str, context):
    result = template_str
    for key, value in context.items():
        # Replace normal {{ key }} and {{ key|default:"..." }} with the actual value
        pattern1 = re.compile(r'{{\s*' + re.escape(key) + r'\s*}}', re.IGNORECASE)
        pattern2 = re.compile(r'{{\s*' + re.escape(key) + r'\s*\|\s*default:\s*(?:"[^"]*"|\'[^\']*\')\s*}}', re.IGNORECASE)
        result = pattern1.sub(str(value), result)
        result = pattern2.sub(str(value), result)

    # For any variables NOT in context but with a default, replace with the default value
    def default_replacer(match):
        return match.group(1)
    result = re.sub(r'{{\s*[\w_]+\s*\|\s*default:\s*"([^"]+)"\s*}}', default_replacer, result)
    result = re.sub(r"{{\s*[\w_]+\s*\|\s*default:\s*'([^']+)'\s*}}", default_replacer, result)

    # Strip any remaining unreplaced simple single-word tags
    result = re.sub(r'{{\s*[\w_]+\s*}}', '', result)

    # IMPORTANT: Also strip multi-word variables like {{Unsubscribe Link}} that have spaces.
    # These are NOT valid template variables in our system and must never be sent raw to
    # Brevo (which has its own template parser and will throw a syntax error on them).
    result = re.sub(r'{{\s*[^}]+\s*}}', '', result)

    return result


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_campaign_emails(self, campaign_id: int):
    """Send a campaign and retain a per-recipient delivery record."""
    from .models import Campaign
    from apps.tracking.models import CampaignPerformance, CampaignRecipientStatus

    try:
        campaign = Campaign.objects.select_related('template', 'target_list', 'podcast_sender').get(id=campaign_id)
    except Campaign.DoesNotExist:
        logger.error("Campaign %s not found.", campaign_id)
        return

    if campaign.status != 'sending':
        logger.warning("Campaign %s is not in sending state. Skipping.", campaign_id)
        return

    contacts = campaign.target_list.contacts.filter(is_subscribed=True)
    if campaign.target_batches.exists():
        contacts = contacts.filter(batches__in=campaign.target_batches.all()).distinct()
        
    if not contacts.exists():
        logger.info("Campaign %s: no subscribed contacts found for the given targets.", campaign_id)
        campaign.status = 'failed'
        campaign.save()
        return

    subject_template = campaign.subject or campaign.template.subject
    layout_template = campaign.template.html_content
    if '{{ body }}' in layout_template:
        layout_template = layout_template.replace('{{ body }}', campaign.template.body)
    else:
        layout_template += campaign.template.body

    sent_count = 0
    failed_count = 0
    for contact in contacts:
        try:
            context = {}
            if isinstance(campaign.template.variables, dict):
                context.update(campaign.template.variables)
            
            context.update({
                'first_name': contact.first_name or context.get('first_name', 'Speaker'),
                'last_name': contact.last_name or context.get('last_name', ''),
                'email': contact.email,
                'subject': subject_template,
            })
            
            sender = campaign.podcast_sender
            if not sender:
                from apps.campaigns.models import PodcastSender
                sender = PodcastSender.objects.first()

            if sender:
                context.update({
                    'brand_name': sender.name,
                    'website_url': sender.website_url,
                    'linkedin_url': sender.linkedin_url,
                    'scheduling_link': getattr(sender, 'scheduling_link', 'https://calendly.com'),
                    'physical_address': sender.physical_address,
                    'current_year': str(timezone.now().year),
                })
            else:
                context.update({
                    'brand_name': 'Web Design Team',
                    'website_url': 'https://webdesign.com',
                    'linkedin_url': '',
                    'scheduling_link': 'https://calendly.com',
                    'physical_address': '',
                    'current_year': str(timezone.now().year),
                })
            

            
            html_content = render_template(layout_template, context)
            text_content = strip_tags(html_content)

            from_email = campaign.from_email

            rendered_subject = render_template(subject_template, context)
            rendered_subject = "".join(rendered_subject.splitlines())

            email = EmailMultiAlternatives(
                subject=rendered_subject,
                body=text_content,
                from_email=from_email,
                to=[contact.email],
                # Brevo returns this tag with webhook events for attribution.
                headers={'X-Mailin-Tag': f'campaign-{campaign.id}'},
            )
            email.attach_alternative(html_content, 'text/html')
            email.send(fail_silently=False)

            sent_at = timezone.now()
            CampaignRecipientStatus.objects.update_or_create(
                campaign=campaign,
                contact=contact,
                defaults={
                    'status': 'sent', 'sent_at': sent_at, 'last_event_at': sent_at,
                    'error_message': '',
                },
            )
            sent_count += 1
            logger.info("Sent to %s", contact.email)
        except Exception as error:
            failed_at = timezone.now()
            CampaignRecipientStatus.objects.update_or_create(
                campaign=campaign,
                contact=contact,
                defaults={
                    'status': 'failed', 'failed_at': failed_at, 'last_event_at': failed_at,
                    'error_message': str(error),
                },
            )
            failed_count += 1
            logger.error("Failed to send to %s: %s", contact.email, error)

    campaign.status = 'sent'
    campaign.sent_at = timezone.now()
    campaign.save()

    performance, _ = CampaignPerformance.objects.get_or_create(campaign=campaign)
    performance.total_sent = sent_count
    performance.total_failed = failed_count
    performance.save()

    logger.info("Campaign '%s' complete. Sent: %s, Failed: %s", campaign.name, sent_count, failed_count)
    return {'sent': sent_count, 'failed': failed_count}
