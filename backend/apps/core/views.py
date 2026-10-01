from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.contacts.models import Contact
from apps.campaigns.models import Campaign
from apps.templates.models import EmailTemplate
from apps.tracking.models import CampaignPerformance
from django.db.models import Sum

class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total_contacts = Contact.objects.count()
        total_campaigns = Campaign.objects.filter(advance_campaign__isnull=True).count()
        total_templates = EmailTemplate.objects.count()

        agg = CampaignPerformance.objects.aggregate(
            total_sent=Sum('total_sent'),
            total_opens=Sum('total_opens')
        )
        total_sent = agg.get('total_sent') or 0
        total_opens = agg.get('total_opens') or 0
        avg_open_rate = "0%"
        if total_sent > 0:
            avg_open_rate = f"{round((total_opens / total_sent) * 100)}%"

        recent_campaigns_qs = Campaign.objects.filter(advance_campaign__isnull=True).select_related('target_list').order_by('-created_at')[:5]
        recent_campaigns = []
        lists_map = {}
        for c in recent_campaigns_qs:
            target_list_id = c.target_list_id
            if c.target_list:
                lists_map[target_list_id] = c.target_list.name
            recent_campaigns.append({
                'id': c.id,
                'name': c.name,
                'status': c.status,
                'target_list': target_list_id,
                'sent_at': c.sent_at.isoformat() if c.sent_at else None,
            })

        return Response({
            'total_contacts': total_contacts,
            'total_campaigns': total_campaigns,
            'total_templates': total_templates,
            'avg_open_rate': avg_open_rate,
            'recent_campaigns': recent_campaigns,
            'lists_map': lists_map,
        })

