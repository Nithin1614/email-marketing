import re
import json
import requests
from django.utils import timezone
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.contacts.models import Contact, ContactList
from apps.campaigns.models import Campaign
from apps.templates.models import EmailTemplate
from apps.tracking.models import CampaignRecipientStatus


def query_dns_json(name, record_type):
    """Queries DNS records via Cloudflare DNS over HTTPS JSON API with Google DNS fallback."""
    headers = {"Accept": "application/dns-json"}
    try:
        url = f"https://cloudflare-dns.com/dns-query?name={name}&type={record_type}"
        resp = requests.get(url, headers=headers, timeout=3.5)
        if resp.status_code == 200:
            data = resp.json()
            answers = data.get("Answer", [])
            return [a.get("data", "").strip(' "') for a in answers if "data" in a]
    except Exception:
        pass

    try:
        url = f"https://dns.google/resolve?name={name}&type={record_type}"
        resp = requests.get(url, timeout=3.5)
        if resp.status_code == 200:
            data = resp.json()
            answers = data.get("Answer", [])
            return [a.get("data", "").strip(' "') for a in answers if "data" in a]
    except Exception:
        pass

    return []


class CheckDomainDnsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        domain = request.query_params.get('domain', '').strip().lower()
        if not domain:
            domain = "gmail.com"

        # Sanitize domain
        if "@" in domain:
            domain = domain.split("@")[-1]
        domain = re.sub(r'^https?://', '', domain).strip('/')

        # 1. SPF Check
        spf_records = query_dns_json(domain, "TXT")
        spf_found = None
        for r in spf_records:
            if "v=spf1" in r:
                spf_found = r
                break

        is_consumer_mail = domain in ["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]

        spf_result = {
            "name": "SPF (Sender Policy)",
            "short_name": "SPF",
            "status": "pass" if spf_found else "missing",
            "record": spf_found,
            "target": "A valid 'v=spf1' record authorizing your mail server",
            "explanation": "Checks if your domain allows our servers to send emails for you.",
            "recommendation": "Add a TXT record with 'v=spf1 include:spf.brevo.com ~all' in your domain's DNS manager." if not spf_found else "SPF is properly configured."
        }

        # 2. DKIM Check
        dkim_found = None
        dkim_selector = None
        for sel in ["brevo", "mail", "google", "default", "k1"]:
            dkim_records = query_dns_json(f"{sel}._domainkey.{domain}", "TXT")
            for r in dkim_records:
                if "v=DKIM1" in r or "p=" in r:
                    dkim_found = r
                    dkim_selector = sel
                    break
            if dkim_found:
                break

        dkim_rec = (
            "For personal @gmail.com or @yahoo.com addresses, Brevo handles this automatically in the background. For custom business domains, add the DKIM TXT record from Brevo."
            if is_consumer_mail and not dkim_found
            else ("Add the DKIM TXT record provided in your Brevo Senders & Domains dashboard." if not dkim_found else f"DKIM verified (Selector: {dkim_selector}).")
        )

        dkim_result = {
            "name": "DKIM (Security Seal)",
            "short_name": "DKIM",
            "status": "pass" if dkim_found else ("pass" if is_consumer_mail else "missing"),
            "record": dkim_found if dkim_found else ("Handled automatically by Brevo for @gmail.com" if is_consumer_mail else None),
            "selector": dkim_selector,
            "target": "A valid cryptographic TXT record matching your email provider",
            "explanation": "A digital security seal proving emails genuinely came from you.",
            "recommendation": dkim_rec
        }

        # 3. DMARC Check
        dmarc_records = query_dns_json(f"_dmarc.{domain}", "TXT")
        dmarc_found = None
        for r in dmarc_records:
            if "v=DMARC1" in r:
                dmarc_found = r
                break

        dmarc_result = {
            "name": "DMARC (Spoofing Shield)",
            "short_name": "DMARC",
            "status": "pass" if dmarc_found else "missing",
            "record": dmarc_found,
            "target": "A valid 'v=DMARC1' record protecting your domain",
            "explanation": "Protects your name so scammers cannot fake sending emails from your domain.",
            "recommendation": "Add a TXT record for '_dmarc' with value 'v=DMARC1; p=none;'." if not dmarc_found else "DMARC policy is active."
        }

        # 4. MX Records Check
        mx_records = query_dns_json(domain, "MX")
        mx_result = {
            "name": "MX (Receiving Mailbox)",
            "short_name": "MX",
            "status": "pass" if mx_records else "missing",
            "record": mx_records[0] if mx_records else None,
            "records_count": len(mx_records),
            "target": "At least 1 working mail server to receive incoming replies",
            "explanation": "Checks if your domain has a working inbox to receive email replies.",
            "recommendation": "Configure MX records pointing to your email provider." if not mx_records else f"Found {len(mx_records)} active mail server(s)."
        }

        # Health score calculation
        checks = [spf_result, dkim_result, dmarc_result, mx_result]
        passed_count = sum(1 for c in checks if c["status"] == "pass")
        score_pct = int((passed_count / len(checks)) * 100)

        return Response({
            "domain": domain,
            "score": score_pct,
            "passed_count": passed_count,
            "total_checks": len(checks),
            "checks": checks,
            "summary": f"{passed_count} of 4 security checks passed for {domain}."
        })


class ScanSpamView(APIView):
    permission_classes = [IsAuthenticated]

    HIGH_RISK_WORDS = [
        "100% free", "100% satisfied", "act now", "apply now", "all natural",
        "bad credit", "be your own boss", "best price", "big bucks", "billion dollars",
        "bonus", "buy direct", "call now", "cancel at any time", "cash bonus",
        "cash prize", "certified", "cheap", "click here", "click now",
        "clearance", "congratulations", "credit card offers", "cures",
        "dear friend", "direct email", "direct marketing", "discount",
        "double your", "earn money", "earn extra cash", "eliminate debt",
        "exclusive deal", "expect to earn", "extra income", "fast cash",
        "financial freedom", "free consultation", "free gift", "free info",
        "free membership", "free money", "free sample", "free trial",
        "full refund", "get out of debt", "get paid", "giveaway",
        "guaranteed", "hidden assets", "income from home", "increase sales",
        "instant", "investment", "join millions", "limited time", "lowest price",
        "make money", "million dollars", "miracle", "money back", "no catch",
        "no cost", "no credit check", "no experience", "no fees", "no gimmick",
        "no hidden", "no interest", "no investment", "no obligation", "no purchase",
        "no risk", "no strings", "not spam", "once in a lifetime", "one time",
        "online marketing", "open immediately", "opportunity", "order now",
        "passwords", "pennies a day", "potential earnings", "prize", "promise",
        "pure profit", "refinance", "risk free", "save big", "save money",
        "score", "see for yourself", "special promotion", "stop snoring",
        "terms and conditions", "this isn't spam", "time limited", "unlimited",
        "unsecured credit", "urgent", "valuable", "viagra", "vicodin",
        "warranty", "we hate spam", "weight loss", "while supplies last",
        "win", "winner", "winning", "work from home", "you have been selected",
        "you're a winner"
    ]

    def post(self, request):
        subject = (request.data.get('subject') or '').strip()
        body = (request.data.get('body') or '').strip()

        score = 100
        flags = []
        found_keywords = []

        combined_text = f"{subject} {body}".lower()

        # 1. Spam trigger words search
        for kw in self.HIGH_RISK_WORDS:
            pattern = r'\b' + re.escape(kw) + r'\b'
            if re.search(pattern, combined_text):
                found_keywords.append(kw)

        if found_keywords:
            deduction = min(40, len(found_keywords) * 8)
            score -= deduction
            flags.append({
                "type": "keywords",
                "severity": "high" if len(found_keywords) >= 3 else "warning",
                "title": f"{len(found_keywords)} Spam Trigger Word(s) Detected",
                "items": found_keywords[:8],
                "penalty": deduction,
                "tip": "Spam filters penalize high-pressure sales words. Replace them with conversational phrases."
            })

        # 2. Subject ALL-CAPS check
        if subject:
            alpha_chars = [c for c in subject if c.isalpha()]
            if len(alpha_chars) >= 8:
                upper_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)
                if upper_ratio > 0.40:
                    score -= 15
                    flags.append({
                        "type": "caps",
                        "severity": "high",
                        "title": "Excessive ALL-CAPS in Subject Line",
                        "penalty": 15,
                        "tip": "Writing in ALL CAPS triggers aggressive spam filters and reduces open rates."
                    })

        # 3. Excessive Punctuation (!!!, ???, $$$)
        excl_matches = len(re.findall(r'!{2,}', subject + body))
        curr_matches = len(re.findall(r'\${2,}', subject + body))
        if excl_matches > 0 or curr_matches > 0:
            penalty = 10
            score -= penalty
            flags.append({
                "type": "punctuation",
                "severity": "warning",
                "title": "Multiple Exclamation / Dollar Signs",
                "penalty": penalty,
                "tip": "Avoid repeated punctuation like '!!!' or '$$$'. Inboxes flag this as promotional spam."
            })

        # 4. Insecure Links check (http://)
        http_links = re.findall(r'http://[^\s<>"]+', body)
        if http_links:
            score -= 10
            flags.append({
                "type": "links",
                "severity": "warning",
                "title": "Insecure HTTP Links Detected",
                "items": http_links[:3],
                "penalty": 10,
                "tip": "Modern mail filters penalize non-HTTPS links. Upgrade all links to https://"
            })

        # 5. Link Shorteners (bit.ly, tinyurl, t.co)
        shorteners = re.findall(r'https?://(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd)/[^\s<>"]+', body)
        if shorteners:
            score -= 15
            flags.append({
                "type": "shorteners",
                "severity": "high",
                "title": "Public URL Shorteners Found",
                "items": shorteners,
                "penalty": 15,
                "tip": "Spammers heavily abuse URL shorteners. Use your direct domain links instead."
            })

        # 6. Unsubscribe Tag Check
        has_unsub = bool(
            "unsubscribe" in body.lower() or
            "{{ unsubscribe" in body.lower() or
            "{% unsubscribe" in body.lower()
        )
        if not has_unsub and len(body) > 50:
            score -= 10
            flags.append({
                "type": "unsubscribe",
                "severity": "warning",
                "title": "No Unsubscribe Link Found",
                "penalty": 10,
                "tip": "CAN-SPAM and GDPR require a clear unsubscribe link in marketing emails."
            })

        final_score = max(0, min(100, score))
        if final_score >= 85:
            rating = "Low Spam Risk"
            rating_desc = "Excellent deliverability. Your email is primed to land in the Primary Inbox."
            status_color = "green"
        elif final_score >= 65:
            rating = "Moderate Spam Risk"
            rating_desc = "Decent formatting, but minor trigger words may route this to the Promotions tab."
            status_color = "amber"
        else:
            rating = "High Spam Risk"
            rating_desc = "High likelihood of spam filtering. We strongly recommend fixing the flagged issues."
            status_color = "red"

        return Response({
            "score": final_score,
            "rating": rating,
            "rating_desc": rating_desc,
            "status_color": status_color,
            "flags": flags,
            "explanation": "Calculates the likelihood of inbox filters (Gmail/Outlook) routing your email to Primary vs Spam folder. Target: 85–100."
        })


class CleanContactsView(APIView):
    permission_classes = [IsAuthenticated]

    # Domain typo mapping dictionary
    TYPO_MAP = {
        "gamil.com": "gmail.com",
        "gmai.com": "gmail.com",
        "gmaill.com": "gmail.com",
        "gmial.com": "gmail.com",
        "gmal.com": "gmail.com",
        "g-mail.com": "gmail.com",
        "yaho.com": "yahoo.com",
        "yahooo.com": "yahoo.com",
        "yaho.co": "yahoo.com",
        "yaho.in": "yahoo.in",
        "hotmial.com": "hotmail.com",
        "hotmai.com": "hotmail.com",
        "hotmial.co": "hotmail.com",
        "outlok.com": "outlook.com",
        "outloo.com": "outlook.com",
        "outlok.co": "outlook.com",
        "icoud.com": "icloud.com",
        "iclud.com": "icloud.com",
        "prton.me": "proton.me",
        "prtonmail.com": "protonmail.com",
        "zho.com": "zoho.com"
    }

    def post(self, request):
        dry_run = request.data.get('dry_run', True)

        contacts = list(Contact.objects.all())
        total_scanned = len(contacts)

        seen_emails = {}
        duplicates = []
        typo_contacts = []
        syntax_errors = []

        email_regex = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')

        for c in contacts:
            raw_email = (c.email or '').strip()
            norm_email = raw_email.lower()

            # 1. Syntax check
            if not email_regex.match(norm_email) or ' ' in norm_email or '..' in norm_email:
                syntax_errors.append({
                    "id": c.id,
                    "name": f"{c.first_name} {c.last_name}".strip(),
                    "email": raw_email,
                    "issue": "Malformed email format"
                })
                continue

            # 2. Duplicate check
            if norm_email in seen_emails:
                duplicates.append({
                    "id": c.id,
                    "name": f"{c.first_name} {c.last_name}".strip(),
                    "email": norm_email,
                    "first_seen_id": seen_emails[norm_email]
                })
            else:
                seen_emails[norm_email] = c.id

            # 3. Domain typo check
            parts = norm_email.split('@')
            if len(parts) == 2:
                user_part, domain_part = parts
                if domain_part in self.TYPO_MAP:
                    corrected_domain = self.TYPO_MAP[domain_part]
                    typo_contacts.append({
                        "id": c.id,
                        "name": f"{c.first_name} {c.last_name}".strip(),
                        "original_email": raw_email,
                        "corrected_email": f"{user_part}@{corrected_domain}",
                        "typo": domain_part,
                        "suggestion": corrected_domain
                    })

        total_issues = len(duplicates) + len(typo_contacts) + len(syntax_errors)
        cleanliness_pct = round(((total_scanned - total_issues) / max(1, total_scanned)) * 100, 1)

        # Apply fixes if not dry run
        fixed_typos_count = 0
        deduped_count = 0

        if not dry_run:
            # Fix typos
            for item in typo_contacts:
                Contact.objects.filter(id=item["id"]).update(email=item["corrected_email"])
                fixed_typos_count += 1

            # Remove exact duplicate records
            dup_ids = [d["id"] for d in duplicates]
            if dup_ids:
                deduped_count = Contact.objects.filter(id__in=dup_ids).delete()[0]

        return Response({
            "dry_run": dry_run,
            "total_scanned": total_scanned,
            "cleanliness_score": cleanliness_pct,
            "target": "98%+ Valid contacts",
            "duplicates_count": len(duplicates),
            "typos_count": len(typo_contacts),
            "syntax_errors_count": len(syntax_errors),
            "duplicates": duplicates[:15],
            "typos": typo_contacts[:15],
            "syntax_errors": syntax_errors[:15],
            "fixed_typos_count": fixed_typos_count,
            "deduped_count": deduped_count,
            "explanation": "Measures how clean your subscriber list is from typos, malformed syntax, and duplicates. Target: 98%+ Valid."
        })


class ExportBackupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now_str = timezone.now().strftime("%Y-%m-%d_%H%M")

        # 1. Contacts
        contacts_data = list(Contact.objects.values(
            'id', 'email', 'first_name', 'last_name', 'phone', 'tags', 'created_at'
        ))
        for c in contacts_data:
            if c.get('created_at'):
                c['created_at'] = c['created_at'].isoformat()

        # 2. Contact Lists
        lists_data = list(ContactList.objects.values('id', 'name', 'created_at'))
        for l in lists_data:
            if l.get('created_at'):
                l['created_at'] = l['created_at'].isoformat()

        # 3. Campaigns
        campaigns_data = list(Campaign.objects.values(
            'id', 'name', 'subject', 'status', 'scheduled_at', 'sent_at', 'created_at'
        ))
        for c in campaigns_data:
            for k in ['scheduled_at', 'sent_at', 'created_at']:
                if c.get(k):
                    c[k] = c[k].isoformat()

        # 4. Templates
        templates_data = list(EmailTemplate.objects.values('id', 'name', 'subject', 'html_content', 'created_at'))
        for t in templates_data:
            if t.get('created_at'):
                t['created_at'] = t['created_at'].isoformat()

        # 5. Bounced Emails
        bounces_data = []
        for b in CampaignRecipientStatus.objects.filter(status__in=['failed', 'hard_bounce', 'soft_bounce']).select_related('contact', 'campaign')[:500]:
            bounces_data.append({
                'id': b.id,
                'email': b.contact.email if b.contact else '',
                'campaign_name': b.campaign.name if b.campaign else '',
                'status': b.status,
                'failed_at': b.failed_at.isoformat() if b.failed_at else None
            })

        export_fmt = request.query_params.get('format', 'json').lower().strip()

        # Format 1: CSV Export (Contacts)
        if export_fmt == 'csv':
            import io
            import csv
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['ID', 'Email', 'First Name', 'Last Name', 'Phone', 'Tags', 'Created At'])
            for c in contacts_data:
                writer.writerow([
                    c.get('id'),
                    c.get('email'),
                    c.get('first_name'),
                    c.get('last_name'),
                    c.get('phone') or '',
                    c.get('tags') or '',
                    c.get('created_at') or ''
                ])
            response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="contacts_export_{now_str}.csv"'
            return response

        # Format 2: Excel (.xlsx) Export (Multi-Tab Workbook)
        elif export_fmt in ('xlsx', 'excel'):
            import io
            import openpyxl
            wb = openpyxl.Workbook()
            
            # Tab 1: Contacts
            ws_contacts = wb.active
            ws_contacts.title = "Contacts"
            ws_contacts.append(['ID', 'Email', 'First Name', 'Last Name', 'Phone', 'Tags', 'Created At'])
            for c in contacts_data:
                ws_contacts.append([
                    c.get('id'), c.get('email'), c.get('first_name'), c.get('last_name'),
                    c.get('phone') or '', str(c.get('tags') or ''), c.get('created_at') or ''
                ])

            # Tab 2: Campaigns
            ws_campaigns = wb.create_sheet(title="Campaigns")
            ws_campaigns.append(['ID', 'Campaign Name', 'Subject', 'Status', 'Scheduled At', 'Sent At', 'Created At'])
            for camp in campaigns_data:
                ws_campaigns.append([
                    camp.get('id'), camp.get('name'), camp.get('subject'), camp.get('status'),
                    camp.get('scheduled_at') or '', camp.get('sent_at') or '', camp.get('created_at') or ''
                ])

            # Tab 3: Templates
            ws_templates = wb.create_sheet(title="Templates")
            ws_templates.append(['ID', 'Template Name', 'Subject', 'Created At'])
            for t in templates_data:
                ws_templates.append([
                    t.get('id'), t.get('name'), t.get('subject'), t.get('created_at') or ''
                ])

            # Tab 4: Bounced Emails
            ws_bounces = wb.create_sheet(title="Bounced Emails")
            ws_bounces.append(['ID', 'Email', 'Campaign', 'Status', 'Failed At'])
            for b in bounces_data:
                ws_bounces.append([
                    b.get('id'), b.get('email'), b.get('campaign_name'), b.get('status'), b.get('failed_at') or ''
                ])

            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)
            response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="email_marketing_backup_{now_str}.xlsx"'
            return response

        # Format 3: PDF Summary Report
        elif export_fmt == 'pdf':
            import io
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas

            buffer = io.BytesIO()
            p = canvas.Canvas(buffer, pagesize=letter)
            width, height = letter

            # Header
            p.setFont("Helvetica-Bold", 18)
            p.drawString(50, height - 50, "Email Marketing Platform - Backup & Summary")
            p.setFont("Helvetica", 9)
            p.drawString(50, height - 68, f"Export Generated: {timezone.now().strftime('%B %d, %Y at %H:%M:%S UTC')}")
            p.line(50, height - 76, width - 50, height - 76)

            # Summary Statistics Section
            p.setFont("Helvetica-Bold", 12)
            p.drawString(50, height - 105, "1. Database Summary")
            p.setFont("Helvetica", 10)
            p.drawString(60, height - 125, f"• Total Contacts: {len(contacts_data)}")
            p.drawString(60, height - 142, f"• Total Contact Lists: {len(lists_data)}")
            p.drawString(60, height - 159, f"• Total Email Campaigns: {len(campaigns_data)}")
            p.drawString(60, height - 176, f"• Total Email Templates: {len(templates_data)}")
            p.drawString(60, height - 193, f"• Recorded Bounces: {len(bounces_data)}")

            # Campaigns Overview Section
            p.setFont("Helvetica-Bold", 12)
            p.drawString(50, height - 230, "2. Recent Campaigns Overview")
            p.setFont("Helvetica-Bold", 9)
            p.drawString(50, height - 250, "Campaign Name")
            p.drawString(240, height - 250, "Status")
            p.drawString(320, height - 250, "Sent / Scheduled Date")
            p.line(50, height - 255, width - 50, height - 255)

            p.setFont("Helvetica", 9)
            y = height - 270
            for camp in campaigns_data[:12]:
                name_str = (camp.get('name') or 'Unnamed')[:32]
                status_str = camp.get('status') or 'draft'
                date_str = (camp.get('sent_at') or camp.get('scheduled_at') or camp.get('created_at') or '—')[:19]
                p.drawString(50, y, name_str)
                p.drawString(240, y, status_str.capitalize())
                p.drawString(320, y, date_str)
                y -= 18
                if y < 80:
                    break

            # Contacts Sample Section
            if y > 140:
                p.setFont("Helvetica-Bold", 12)
                p.drawString(50, y - 20, "3. Contacts Sample (Recent)")
                p.line(50, y - 26, width - 50, y - 26)
                p.setFont("Helvetica", 9)
                cy = y - 42
                for c in contacts_data[:6]:
                    full_name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or "—"
                    p.drawString(50, cy, f"• {c.get('email', '')} ({full_name})")
                    cy -= 16

            p.setFont("Helvetica-Oblique", 8)
            p.drawString(50, 35, "Confidential Email Marketing Backup Report • Generated automatically")

            p.showPage()
            p.save()
            buffer.seek(0)
            response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="email_marketing_summary_{now_str}.pdf"'
            return response

        # Format 4 (Default): Complete JSON Backup
        backup_payload = {
            "backup_version": "1.0",
            "created_at": timezone.now().isoformat(),
            "summary": {
                "total_contacts": len(contacts_data),
                "total_lists": len(lists_data),
                "total_campaigns": len(campaigns_data),
                "total_templates": len(templates_data),
                "total_bounces": len(bounces_data)
            },
            "contacts": contacts_data,
            "contact_lists": lists_data,
            "campaigns": campaigns_data,
            "templates": templates_data,
            "bounced_emails": bounces_data,
        }

        response = HttpResponse(
            json.dumps(backup_payload, indent=2),
            content_type="application/json"
        )
        response['Content-Disposition'] = f'attachment; filename="email_marketing_backup_{now_str}.json"'
        return response
