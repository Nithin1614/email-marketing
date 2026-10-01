import requests
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import Campaign, AdvanceCampaign, PodcastSender
from .serializers import CampaignSerializer, AdvanceCampaignSerializer, PodcastSenderSerializer

class PodcastSenderViewSet(viewsets.ModelViewSet):
    serializer_class = PodcastSenderSerializer
    queryset = PodcastSender.objects.all().order_by('name')



class SenderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fallback_senders = [
            {"name": "Web Design Team", "email": "webdesign.team24@gmail.com"},
        ]

        brevo_api_key = getattr(settings, 'BREVO_API_KEY', None)
        if not brevo_api_key:
            return Response(fallback_senders)

        try:
            response = requests.get(
                'https://api.brevo.com/v3/senders',
                headers={'api-key': brevo_api_key, 'accept': 'application/json'}
            )
            response.raise_for_status()
            data = response.json()
            senders = []
            for sender in data.get('senders', []):
                senders.append({
                    "name": sender.get('name', ''),
                    "email": sender.get('email', ''),
                })
            if not senders:
                return Response(fallback_senders)
            return Response(senders)
        except Exception as e:
            return Response(fallback_senders)


class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class = CampaignSerializer

    def get_queryset(self):
        qs = Campaign.objects.all().order_by('-created_at')
        if self.action == 'list':
            qs = qs.filter(advance_campaign__isnull=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        campaign = self.get_object()
        if campaign.status == 'sending':
            return Response(
                {'error': 'A campaign cannot be deleted while it is sending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        campaign = self.get_object()

        if campaign.status not in ('draft', 'failed'):
            return Response(
                {'error': f"Cannot send a campaign with status '{campaign.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        campaign.status = 'sending'
        campaign.save()

        # Trigger the send in a background daemon thread so it runs immediately without needing a separate Celery worker
        from .tasks import send_campaign_emails
        from django.db import close_old_connections
        import threading

        def run_send_task():
            close_old_connections()
            try:
                send_campaign_emails(campaign.id)
            except Exception as e:
                logger.error("Error in background send task: %s", e)
            finally:
                close_old_connections()

        threading.Thread(target=run_send_task, daemon=True).start()

        return Response({'status': 'Campaign queued for sending.'})

    @action(detail=True, methods=['post'], url_path='send-test')
    def send_test(self, request, pk=None):
        campaign = self.get_object()
        raw_emails = request.data.get('emails', [])
        if isinstance(raw_emails, str):
            raw_emails = [e.strip() for e in raw_emails.replace(',', ' ').split() if e.strip()]

        default_email = getattr(settings, 'EMAIL_HOST_USER', 'webdesign.team24@gmail.com')
        if '@smtp-brevo.com' in default_email:
            default_email = 'webdesign.team24@gmail.com'

        if not raw_emails:
            raw_emails = [default_email]

        emails = [e for e in raw_emails if '@' in e][:5]
        if not emails:
            return Response({'error': 'No valid recipient email address provided.'}, status=status.HTTP_400_BAD_REQUEST)

        from .tasks import render_template
        from django.core.mail import EmailMultiAlternatives, get_connection
        from django.utils.html import strip_tags
        from django.utils import timezone
        from django.db import close_old_connections
        import threading
        import logging

        logger = logging.getLogger(__name__)

        def send_test_worker(campaign_id, email_list):
            close_old_connections()
            try:
                camp = Campaign.objects.select_related('template', 'podcast_sender').filter(id=campaign_id).first()
                if not camp:
                    return

                subject_template = camp.subject or (camp.template.subject if camp.template else 'Preview Email')
                layout_template = camp.template.html_content if camp.template else ''
                body_content = camp.template.body if camp.template else ''
                if '{{ body }}' in layout_template:
                    layout_template = layout_template.replace('{{ body }}', body_content)
                else:
                    layout_template += body_content

                sender = camp.podcast_sender or PodcastSender.objects.first()
                brand_name = sender.name if sender else 'Web Design Team'
                website_url = sender.website_url if sender else 'https://webdesign.com'
                scheduling_link = getattr(sender, 'scheduling_link', 'https://calendly.com')
                physical_address = sender.physical_address if sender else ''

                from_addr = camp.from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', 'Web Design Team <webdesign.team24@gmail.com>')

                messages = []
                for email_addr in email_list:
                    context = {}
                    if camp.template and isinstance(camp.template.variables, dict):
                        context.update(camp.template.variables)

                    context.update({
                        'first_name': 'Test User',
                        'last_name': '',
                        'email': email_addr,
                        'subject': subject_template,
                        'brand_name': brand_name,
                        'website_url': website_url,
                        'linkedin_url': getattr(sender, 'linkedin_url', ''),
                        'scheduling_link': scheduling_link,
                        'physical_address': physical_address,
                        'current_year': str(timezone.now().year),
                    })

                    html_content = render_template(layout_template, context)
                    text_content = strip_tags(html_content)
                    rendered_subject = "[TEST] " + "".join(render_template(subject_template, context).splitlines())

                    msg = EmailMultiAlternatives(
                        subject=rendered_subject,
                        body=text_content,
                        from_email=from_addr,
                        to=[email_addr],
                        headers={'X-Mailin-Tag': f'test-campaign-{camp.id}'},
                    )
                    msg.attach_alternative(html_content, 'text/html')
                    messages.append(msg)

                if messages:
                    connection = get_connection()
                    connection.send_messages(messages)
                    logger.info("Successfully sent %d test email(s) for campaign %s", len(messages), camp.id)
            except Exception as exc:
                logger.error("Error in test email worker for campaign %s: %s", campaign_id, exc)
            finally:
                close_old_connections()

        threading.Thread(target=send_test_worker, args=(campaign.id, emails), daemon=True).start()

        return Response({
            'status': 'success',
            'sent_to': emails,
            'message': f"Test email queued for {len(emails)} recipient(s)! Check your inbox shortly."
        })

    @action(detail=True, methods=['post'], url_path='convert-to-advanced')
    def convert_to_advanced(self, request, pk=None):
        campaign = self.get_object()

        if campaign.advance_campaign:
            return Response(
                {'error': 'This campaign is already part of an advance campaign.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        advance_campaign = AdvanceCampaign.objects.create(
            name=campaign.name,
            target_list=campaign.target_list
        )

        campaign.advance_campaign = advance_campaign
        campaign.save()

        return Response({
            'status': 'Converted to advance campaign.',
            'advance_campaign_id': advance_campaign.id
        })


class AdvanceCampaignViewSet(viewsets.ModelViewSet):
    serializer_class = AdvanceCampaignSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        try:
            from config.urls import ensure_db_schema
            ensure_db_schema()
        except Exception:
            pass

    def get_queryset(self):
        try:
            list(AdvanceCampaign.objects.only('id', 'share_token')[:1])
            return AdvanceCampaign.objects.all().order_by('-created_at')
        except Exception:
            return AdvanceCampaign.objects.defer('share_token').order_by('-created_at')

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except Exception:
            # Self-heal schema in PostgreSQL if share_token column is missing
            from django.db import connection
            try:
                with connection.cursor() as cursor:
                    cursor.execute("""
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns 
                                WHERE table_name='campaigns_advancecampaign' AND column_name='share_token'
                            ) THEN
                                ALTER TABLE campaigns_advancecampaign ADD COLUMN share_token UUID DEFAULT gen_random_uuid();
                                UPDATE campaigns_advancecampaign SET share_token = gen_random_uuid() WHERE share_token IS NULL;
                                ALTER TABLE campaigns_advancecampaign ALTER COLUMN share_token SET NOT NULL;
                                CREATE UNIQUE INDEX IF NOT EXISTS campaigns_advancecampaign_share_token_uniq ON campaigns_advancecampaign (share_token);
                            END IF;
                        END $$;
                    """)
                return super().create(request, *args, **kwargs)
            except Exception as retry_err:
                raise retry_err



    @action(detail=False, methods=['get'], url_path='recent-blasts')
    def recent_blasts(self, request):
        recent = Campaign.objects.filter(advance_campaign__isnull=False).order_by('-created_at')[:50]
        serializer = CampaignSerializer(recent, many=True)
        return Response({'results': serializer.data})


