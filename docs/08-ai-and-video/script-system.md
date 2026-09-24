# Phase 8: Template Script Engine

The Script System generates personalized video scripts from template baselines for each client company.

## 1. Template Variables and Safety

The script engine uses safe template substitution without executing arbitrary code:

Supported Variables:
- `{{client_name}}`: The contact person name (for example, John Doe).
- `{{company_name}}`: The business name (for example, ABC Roofing).

The engine replaces these tokens with HTML-sanitized values.

## 2. Three Confirmed Base Scripts

The system provides 3 template-driven scripts:

1. Script 1: Introduction and Brand Story
"Hello, I am {{client_name}} with {{company_name}}. We specialize in providing residential and commercial roof restoration and inspections throughout our local community. Our team is committed to safety, reliability, and long-lasting quality."

2. Script 2: Service Offer and Customer Value
"At {{company_name}}, we know your roof is your property first line of defense. My name is {{client_name}}, and we offer comprehensive roof assessments designed to identify issues before they lead to expensive structural damage."

3. Script 3: Call to Action and Inspection Booking
"Looking for honest, professional roofing services? Reach out to {{client_name}} at {{company_name}} today to schedule your complimentary inspection."

## 3. Template Management and Client Workflow

- Admin and CSM users can edit the base script templates in the administrative workspace.
- The client views the 3 generated scripts in their portal, customized with their name and company name.
- The client can select their production preference ("AI Video" or "Self-Filmed Video") and copy or review the scripts.
