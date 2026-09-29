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

        # Trigger the async Celery task
        from .tasks import send_campaign_emails
        send_campaign_emails.delay(campaign.id)

        return Response({'status': 'Campaign queued for sending.'})

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


