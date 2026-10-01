"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from rest_framework.routers import DefaultRouter
from rest_framework.authtoken.views import obtain_auth_token

def health_check(request):
    try:
        from apps.campaigns.views import check_and_send_due_campaigns
        check_and_send_due_campaigns()
    except Exception:
        pass
    return JsonResponse({"status": "ok", "app": "email-marketing"})

from apps.contacts.views import ContactViewSet, ContactListViewSet, IgnoredContactViewSet, ContactBatchViewSet, MutualContactViewSet
from apps.templates.views import EmailTemplateViewSet
from apps.campaigns.views import CampaignViewSet, SenderListView, AdvanceCampaignViewSet, PodcastSenderViewSet
from apps.tracking.views import CampaignPerformanceViewSet, CampaignAnalyticsViewSet, BrevoWebhookView, BouncedEmailViewSet, PublicCampaignAnalyticsView, MasterLinkSettingsView, PublicMasterLinkCampaignsView, PublicAdvanceCampaignView, PublicMasterLinkRecentsView, PublicMasterLinkContactsView
from apps.core.views import DashboardSummaryView


def ensure_db_schema():
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
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='tracking_masterlinksettings' AND column_name='password'
                    ) THEN
                        ALTER TABLE tracking_masterlinksettings ADD COLUMN password VARCHAR(128) DEFAULT '';
                    END IF;
                END $$;
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS contacts_mutualcontact (
                    id BIGSERIAL PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    first_name VARCHAR(255) NOT NULL DEFAULT '',
                    last_name VARCHAR(255) NOT NULL DEFAULT '',
                    who_is_importing VARCHAR(255) NOT NULL DEFAULT '',
                    target_list_name VARCHAR(255) NOT NULL DEFAULT '',
                    already_exists_in VARCHAR(255) NOT NULL DEFAULT '',
                    reason TEXT NOT NULL DEFAULT 'Mutual: already exists in another list',
                    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tracking_testemaillog (
                    id BIGSERIAL PRIMARY KEY,
                    recipient_email VARCHAR(255) NOT NULL,
                    campaign_id BIGINT NULL,
                    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)
            cursor.execute("""
                INSERT INTO django_migrations (app, name, applied)
                SELECT 'campaigns', '0011_advancecampaign_share_token', NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM django_migrations WHERE app='campaigns' AND name='0011_advancecampaign_share_token'
                );
                INSERT INTO django_migrations (app, name, applied)
                SELECT 'tracking', '0008_testemaillog', NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM django_migrations WHERE app='tracking' AND name='0008_testemaillog'
                );
            """)
    except Exception:
        pass

ensure_db_schema()

router = DefaultRouter(trailing_slash=r'/?')
router.register(r'contacts', ContactViewSet, basename='contact')
router.register(r'contact-lists', ContactListViewSet, basename='contactlist')
router.register(r'ignored-contacts', IgnoredContactViewSet, basename='ignoredcontact')
router.register(r'mutual-contacts', MutualContactViewSet, basename='mutualcontact')
router.register(r'contact-batches', ContactBatchViewSet, basename='contactbatch')
router.register(r'templates', EmailTemplateViewSet, basename='emailtemplate')
router.register(r'campaigns', CampaignViewSet, basename='campaign')
router.register(r'advance-campaigns', AdvanceCampaignViewSet, basename='advancecampaign')

router.register(r'podcast-senders', PodcastSenderViewSet, basename='podcastsender')
router.register(r'tracking', CampaignPerformanceViewSet, basename='campaignperformance')
router.register(r'campaign-analytics', CampaignAnalyticsViewSet, basename='campaignanalytics')
router.register(r'bounces', BouncedEmailViewSet, basename='bouncedemail')

urlpatterns = [
    path('api/health/', health_check, name='health_check'),
    path('api/health', health_check, name='health_check_no_slash'),
    path('healthz/', health_check, name='healthz'),
    path('healthz', health_check, name='healthz_no_slash'),
    path('admin/', admin.site.urls),
    path('api/v1/', include(router.urls)),
    path('api/v1/auth/token/', obtain_auth_token, name='api_token_auth'),
    path('api/v1/auth/token', obtain_auth_token, name='api_token_auth_no_slash'),
    path('api/v1/dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('api/v1/dashboard/summary', DashboardSummaryView.as_view(), name='dashboard-summary-no-slash'),
    path('api/v1/senders/', SenderListView.as_view(), name='sender-list'),
    path('api/v1/webhooks/brevo/', BrevoWebhookView.as_view(), name='brevo-webhook'),
    path('api/v1/webhooks/brevo', BrevoWebhookView.as_view(), name='brevo-webhook-no-slash'),
    path('api/v1/public/campaign/<str:token>/', PublicAdvanceCampaignView.as_view(), name='public-advance-campaign'),
    path('api/v1/public-analytics/<uuid:token>/', PublicCampaignAnalyticsView.as_view(), name='public-analytics'),
    path('api/v1/master-link/settings/', MasterLinkSettingsView.as_view(), name='master-link-settings'),
    path('api/v1/public/master-link/<uuid:token>/campaigns/', PublicMasterLinkCampaignsView.as_view(), name='public-master-link-campaigns'),
    path('api/v1/public/master-link/<uuid:token>/recents/', PublicMasterLinkRecentsView.as_view(), name='public-master-link-recents'),
    path('api/v1/public/master-link/<uuid:token>/contacts/', PublicMasterLinkContactsView.as_view(), name='public-master-link-contacts'),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
]
