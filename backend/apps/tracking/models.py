from django.db import models
from apps.campaigns.models import Campaign
from apps.contacts.models import Contact

class CampaignPerformance(models.Model):
    campaign = models.OneToOneField(Campaign, on_delete=models.CASCADE, related_name='performance')
    total_sent = models.IntegerField(default=0)
    total_opens = models.IntegerField(default=0)
    total_clicks = models.IntegerField(default=0)
    total_bounces = models.IntegerField(default=0)
    total_delivered = models.IntegerField(default=0)
    total_failed = models.IntegerField(default=0)
    
    # Detailed granular metrics
    total_unsubscribed = models.IntegerField(default=0)
    total_complaints = models.IntegerField(default=0)
    total_deferred = models.IntegerField(default=0)
    total_hard_bounces = models.IntegerField(default=0)
    total_soft_bounces = models.IntegerField(default=0)
    total_invalid = models.IntegerField(default=0)
    total_blocked = models.IntegerField(default=0)
    total_errors = models.IntegerField(default=0)
    
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Performance for {self.campaign.name}"


class CampaignRecipientStatus(models.Model):
    """The latest delivery and engagement state for one campaign recipient."""

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('sent', 'Sent to provider'),
        ('delivered', 'Delivered'),
        ('opened', 'Opened'),
        ('clicked', 'Clicked'),
        ('bot_scanned', 'Bot Scanned'),
        ('failed', 'Failed'),
        ('deferred', 'Deferred'),
        ('unsubscribed', 'Unsubscribed'),
        ('complaint', 'Complaint (Spam)'),
        ('hard_bounce', 'Hard Bounce'),
        ('soft_bounce', 'Soft Bounce'),
        ('invalid_email', 'Invalid Email'),
        ('blocked', 'Blocked'),
        ('error', 'Error'),
    )

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='recipient_statuses')
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='campaign_statuses')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    clicked_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    last_event_at = models.DateTimeField(null=True, blank=True)
    clicked_links = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['campaign', 'contact'], name='unique_campaign_recipient_status'),
        ]
        indexes = [models.Index(fields=['campaign', 'status'])]

    def __str__(self):
        return f"{self.campaign.name}: {self.contact.email} ({self.status})"


import uuid

class MasterLinkSettings(models.Model):
    token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_active = models.BooleanField(default=False)
    password = models.CharField(max_length=128, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.pk and MasterLinkSettings.objects.exists():
            return
        super().save(*args, **kwargs)

    @classmethod
    def get_settings(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"Master Link {'Active' if self.is_active else 'Inactive'}"


class TestEmailLog(models.Model):
    recipient_email = models.CharField(max_length=255)
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='test_logs')
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"Test to {self.recipient_email} at {self.sent_at}"
