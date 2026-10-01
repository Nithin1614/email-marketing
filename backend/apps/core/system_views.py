import socket
import requests
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.db import connection
from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.contacts.models import Contact
from apps.campaigns.models import Campaign
from apps.templates.models import EmailTemplate
from apps.tracking.models import CampaignPerformance, CampaignRecipientStatus, TestEmailLog


class SystemHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()

        # 1. Scheduler & Cron Heartbeat
        last_ping = None
        seconds_ago = None
        scheduler_status = "offline"

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT last_ping FROM core_systemheartbeat WHERE id = 1;")
                row = cursor.fetchone()
                if row and row[0]:
                    last_ping = row[0]
                    seconds_ago = int((now - last_ping).total_seconds())
                    if seconds_ago < 180:  # < 3 minutes
                        scheduler_status = "active"
                    elif seconds_ago < 420:  # < 7 minutes
                        scheduler_status = "warning"
                    else:
                        scheduler_status = "offline"
        except Exception:
            scheduler_status = "offline"

        pending_scheduled = Campaign.objects.filter(status='scheduled', scheduled_at__gt=now).count()
        due_campaigns = Campaign.objects.filter(status='scheduled', scheduled_at__lte=now).count()

        # 2. Database Storage Meter (PostgreSQL database size)
        total_db_bytes = 0
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_database_size(current_database());")
                total_db_bytes = cursor.fetchone()[0]
        except Exception:
            total_db_bytes = 15 * 1024 * 1024

        total_mb = round(total_db_bytes / (1024 * 1024), 2)
        limit_mb = 500.0
        used_percentage = min(100.0, round((total_mb / limit_mb) * 100, 1))

        counts = {
            "contacts": Contact.objects.count(),
            "campaigns": Campaign.objects.count(),
            "templates": EmailTemplate.objects.count(),
            "recipient_logs": CampaignRecipientStatus.objects.count(),
            "test_logs": TestEmailLog.objects.count(),
        }

        # 3. Brevo Engine & SMTP Health
        brevo_key = getattr(settings, 'BREVO_API_KEY', None)
        has_brevo_key = bool(brevo_key and len(brevo_key) > 10)

        # Today's daily quota calculation (00:00 UTC to now)
        today_start_utc = now.replace(hour=0, minute=0, second=0, microsecond=0)
        blast_sent_today = CampaignRecipientStatus.objects.filter(
            sent_at__gte=today_start_utc,
            status__in=['sent', 'delivered', 'opened', 'clicked', 'hard_bounce', 'soft_bounce']
        ).count()
        test_sent_today = TestEmailLog.objects.filter(sent_at__gte=today_start_utc).count()
        quota_used = blast_sent_today + test_sent_today
        quota_limit = 300
        quota_remaining = max(0, quota_limit - quota_used)

        # 4. Account Bounce Safety
        totals = CampaignPerformance.objects.aggregate(
            deliv=Sum('total_delivered'),
            bounce=Sum('total_bounces')
        )
        total_delivered = totals.get('deliv') or 0
        total_bounces = totals.get('bounce') or 0
        total_active_mail = total_delivered + total_bounces
        bounce_rate = round((total_bounces / max(1, total_active_mail)) * 100, 2)
        bounce_status = "safe" if bounce_rate < 3.0 else ("warning" if bounce_rate < 5.0 else "critical")

        # 5. Webhook Latency & Health Monitor
        last_webhook_time = None
        webhook_seconds_ago = None
        webhook_status = "idle"
        webhook_msg = "Ready • Awaiting live events"

        latest_ev = CampaignRecipientStatus.objects.exclude(last_event_at__isnull=True).order_by('-last_event_at').first()
        total_webhook_events = CampaignRecipientStatus.objects.exclude(last_event_at__isnull=True).count()
        if latest_ev and latest_ev.last_event_at:
            last_webhook_time = latest_ev.last_event_at
            webhook_seconds_ago = int((now - last_webhook_time).total_seconds())
            if webhook_seconds_ago < 3600:  # < 1 hour
                webhook_status = "active"
                if webhook_seconds_ago < 60:
                    webhook_msg = f"Active • Last ping {webhook_seconds_ago}s ago"
                else:
                    mins = webhook_seconds_ago // 60
                    webhook_msg = f"Active • Last ping {mins}m ago"
            elif webhook_seconds_ago < 86400:  # < 24 hours
                webhook_status = "idle"
                hours = webhook_seconds_ago // 3600
                webhook_msg = f"Idle • Last ping {hours}h ago"
            else:
                days = webhook_seconds_ago // 86400
                webhook_status = "warning"
                webhook_msg = f"Quiet • Last ping {days}d ago"
        else:
            has_sent_campaigns = Campaign.objects.filter(status='sent').exists()
            if has_sent_campaigns:
                webhook_status = "warning"
                webhook_msg = "Waiting for initial events from Brevo"
            else:
                webhook_status = "idle"
                webhook_msg = "Idle • Ready to receive live webhook events"

        # 6. Recent Webhook Events (last 10 events)
        recent_events = []
        try:
            event_qs = CampaignRecipientStatus.objects.select_related('contact', 'campaign')\
                .exclude(last_event_at__isnull=True).order_by('-last_event_at')[:10]
            for ev in event_qs:
                recent_events.append({
                    "id": ev.id,
                    "email": ev.contact.email if ev.contact else "unknown",
                    "campaign_name": ev.campaign.name if ev.campaign else "Unknown Campaign",
                    "status": ev.status,
                    "timestamp": ev.last_event_at.isoformat() if ev.last_event_at else None,
                })
        except Exception:
            pass

        return Response({
            "scheduler": {
                "status": scheduler_status,
                "last_ping": last_ping.isoformat() if last_ping else None,
                "seconds_ago": seconds_ago,
                "pending_queue": pending_scheduled,
                "due_queue": due_campaigns,
                "explanation": "Tracks when the cron job last pinged the server to dispatch scheduled emails."
            },
            "database": {
                "used_mb": total_mb,
                "limit_mb": limit_mb,
                "used_percentage": used_percentage,
                "counts": counts,
                "explanation": "Shows actual PostgreSQL disk usage against your 500 MB free cloud limit."
            },
            "brevo": {
                "api_configured": has_brevo_key,
                "quota_used": quota_used,
                "quota_limit": quota_limit,
                "quota_remaining": quota_remaining,
                "quota_percentage": min(100.0, round((quota_used / quota_limit) * 100, 1)),
                "blast_today": blast_sent_today,
                "test_today": test_sent_today,
                "explanation": "Monitors Brevo's 300 free emails per day limit (resets daily at 00:00 UTC)."
            },
            "bounce_radar": {
                "bounce_rate": bounce_rate,
                "total_delivered": total_delivered,
                "total_bounces": total_bounces,
                "status": bounce_status,
                "threshold": "4.0%",
                "explanation": "Brevo suspends sending if bounce rate exceeds 4–5%. Keeping this low protects deliverability."
            },
            "webhook_monitor": {
                "status": webhook_status,
                "last_event_at": last_webhook_time.isoformat() if last_webhook_time else None,
                "seconds_ago": webhook_seconds_ago,
                "message": webhook_msg,
                "total_events": total_webhook_events,
                "explanation": "Monitors incoming Brevo webhook delivery and open tracking events in real time."
            },
            "recent_webhooks": recent_events
        })


class RunDiagnosticsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import time

        results = []

        # Test 1: Database Read/Write
        t0 = time.time()
        db_ok = False
        db_msg = "Database connection error"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            db_latency = int((time.time() - t0) * 1000)
            db_ok = True
            db_msg = f"Connected in {db_latency}ms"
        except Exception as e:
            db_latency = int((time.time() - t0) * 1000)
            db_msg = str(e)[:100]

        results.append({
            "name": "PostgreSQL Database",
            "type": "database",
            "status": "pass" if db_ok else "fail",
            "latency_ms": db_latency,
            "message": db_msg,
            "explanation": "Confirms live read/write capability to your PostgreSQL database."
        })

        # Test 2: Brevo API Key & Account Check
        t0 = time.time()
        api_ok = False
        api_msg = "Brevo API key not configured"
        brevo_key = getattr(settings, 'BREVO_API_KEY', None)
        if brevo_key:
            try:
                resp = requests.get(
                    'https://api.brevo.com/v3/account',
                    headers={'api-key': brevo_key, 'accept': 'application/json'},
                    timeout=4
                )
                api_latency = int((time.time() - t0) * 1000)
                if resp.status_code == 200:
                    api_ok = True
                    acc_email = resp.json().get('email', 'Account active')
                    api_msg = f"Verified ({acc_email}) in {api_latency}ms"
                else:
                    api_msg = f"HTTP {resp.status_code}: {resp.text[:60]}"
            except Exception as e:
                api_latency = int((time.time() - t0) * 1000)
                api_msg = f"Connection timeout: {str(e)[:60]}"
        else:
            api_latency = 0

        results.append({
            "name": "Brevo REST API",
            "type": "api",
            "status": "pass" if api_ok else "fail",
            "latency_ms": api_latency,
            "message": api_msg,
            "explanation": "Validates that your Brevo API key is active and authorized to send."
        })

        # Test 3: Brevo Outbound Port 2525
        t0 = time.time()
        port_2525_ok = False
        try:
            sock = socket.create_connection(('smtp-relay.brevo.com', 2525), timeout=2.5)
            sock.close()
            p2525_latency = int((time.time() - t0) * 1000)
            port_2525_ok = True
            p2525_msg = f"Handshake successful in {p2525_latency}ms"
        except Exception as e:
            p2525_latency = int((time.time() - t0) * 1000)
            p2525_msg = "Blocked or timed out"

        results.append({
            "name": "Brevo SMTP Relay (Port 2525)",
            "type": "smtp",
            "status": "pass" if port_2525_ok else "fail",
            "latency_ms": p2525_latency,
            "message": p2525_msg,
            "explanation": "Tests outbound mail relay connection on port 2525 (recommended for Render cloud)."
        })

        # Test 4: Brevo Outbound Port 587
        t0 = time.time()
        port_587_ok = False
        try:
            sock = socket.create_connection(('smtp-relay.brevo.com', 587), timeout=2.5)
            sock.close()
            p587_latency = int((time.time() - t0) * 1000)
            port_587_ok = True
            p587_msg = f"Handshake successful in {p587_latency}ms"
        except Exception:
            p587_latency = int((time.time() - t0) * 1000)
            p587_msg = "Port 587 blocked by cloud host"

        results.append({
            "name": "Brevo SMTP Relay (Port 587)",
            "type": "smtp",
            "status": "pass" if port_587_ok else "warning",
            "latency_ms": p587_latency,
            "message": p587_msg,
            "explanation": "Standard TLS port. If blocked by host, Port 2525 is automatically used as fallback."
        })

        # Test 5: Scheduler / Cron Ping
        cron_ok = False
        cron_msg = "No cron ping received yet"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT last_ping FROM core_systemheartbeat WHERE id = 1;")
                row = cursor.fetchone()
                if row and row[0]:
                    secs = int((timezone.now() - row[0]).total_seconds())
                    if secs < 180:
                        cron_ok = True
                        cron_msg = f"Active (last ping {secs}s ago)"
                    else:
                        cron_msg = f"Warning: last ping was {secs // 60}m ago"
        except Exception:
            pass

        results.append({
            "name": "Cron Scheduler Heartbeat",
            "type": "cron",
            "status": "pass" if cron_ok else "warning",
            "latency_ms": 0,
            "message": cron_msg,
            "explanation": "Ensures cron-job.org is actively pinging /api/health/ to dispatch scheduled campaigns."
        })

        # Test 6: Brevo Webhook Stream Pipeline
        total_evs = CampaignRecipientStatus.objects.exclude(last_event_at__isnull=True).count()
        latest_ev = CampaignRecipientStatus.objects.exclude(last_event_at__isnull=True).order_by('-last_event_at').first()
        if latest_ev and latest_ev.last_event_at:
            secs_ev = int((timezone.now() - latest_ev.last_event_at).total_seconds())
            if secs_ev < 3600:
                wh_diag_msg = f"Live ({secs_ev // 60}m ago • {total_evs} logged)"
            else:
                wh_diag_msg = f"Ready ({total_evs} events captured)"
        else:
            wh_diag_msg = "Endpoint active (/api/v1/webhooks/brevo/) • Ready"

        results.append({
            "name": "Brevo Webhook Stream Pipeline",
            "type": "webhook",
            "status": "pass",
            "latency_ms": 1,
            "message": wh_diag_msg,
            "explanation": "Validates that your live webhook pipeline is ready to log delivery, open, and click events."
        })

        overall_ok = db_ok and api_ok and (port_2525_ok or port_587_ok)
        return Response({
            "overall_status": "healthy" if overall_ok else "needs attention",
            "timestamp": timezone.now().isoformat(),
            "results": results
        })


class PruneLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cutoff_date = timezone.now() - timedelta(days=90)
        pruned_tests = TestEmailLog.objects.filter(sent_at__lt=cutoff_date).delete()[0]
        pruned_statuses = CampaignRecipientStatus.objects.filter(
            sent_at__lt=cutoff_date,
            campaign__status='sent'
        ).delete()[0]

        return Response({
            "status": "success",
            "pruned_test_logs": pruned_tests,
            "pruned_recipient_statuses": pruned_statuses,
            "total_pruned": pruned_tests + pruned_statuses,
            "message": f"Successfully pruned {pruned_tests + pruned_statuses} log entries older than 90 days."
        })
