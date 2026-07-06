---
name: No-contact tickets & tracking
description: Public report form collects no reporter contact/consent; consequence for the ticket-tracking verification flow.
---

The public `/help/report-problem` form no longer collects reporter name, type, email, WhatsApp, or POPIA consent. The backend (`POST /support/tickets`, DB `reporter_*` columns, OpenAPI `SupportTicketSubmission`) treats all of these as optional/nullable, so tickets save with no contact info and `consentGivenAt`/`consentIp` null.

**Consequence — public ticket tracking:** `/support/public/verify-ticket` (used by `/help/track-ticket`) verifies identity by matching the entered email or WhatsApp against the stored ticket contact fields. Tickets created via the new form have neither, so **they can never be verified/tracked** through that flow. Contact-bearing tickets (e.g. from the external E-Migration Assist API integration) still track fine.

**Why:** the user explicitly chose to remove all reporter contact + consent from the form ("tickets save with no contact info or consent"). Identity-based tracking is impossible without any identifying contact — this is an inherent tradeoff, not a bug.

**How to apply:** if untrackable no-contact tickets become a problem, the fix is a net-new mechanism (one-time access token / tracking PIN returned at creation and shown on the confirmation page), plus updating the verify-ticket contract and the track-ticket UI to accept it while keeping contact-based verification for legacy/API tickets. Do not silently break the existing contact-based path.
