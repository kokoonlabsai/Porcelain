# Derma Clinic

A web app for a dermatology clinic. Patients book online, see their prescriptions and next visit date on their phone, and learn about procedures and care. The doctor writes prescriptions, the pharmacy desk hands medicines over, and the admin sets the schedule.

## What's in it

### For patients
- **Booking with or without an account.** The patient picks what they're coming in for (hair, skin, wellness, a procedure or something else) and can describe the problem if they want to. They choose a day from a date strip that shows free slots per day, pick a time grouped into morning, afternoon and evening, and enter their name, phone and an optional email. No email or OTP is required.
- **One-step account creation** right after booking: the patient sets a password and lands in their portal.
- **Patient portal** (log in with phone + password):
  - next appointment, with add-to-calendar (.ics) and cancel
  - latest prescription: each medicine with how and when to take it, and whether it's still to collect at the pharmacy or already collected
  - the doctor's advice, the procedure done and photos the doctor shared
  - a follow-up banner ("Follow-up in 2 days — Book now"), which turns amber when it's close and clay when overdue
  - all visits as a timeline, and a printable prescription (Print → Save as PDF)
  - articles picked for their concern
- **Learn**: 16 starter articles written for patients:
  - procedures: PRP, chemical peels, laser hair reduction, microneedling/RF, HydraFacial, acne scars
  - hair care, skin care and wellness
  - three "myths busted" pieces
- **Emails** (once SMTP is set): booking confirmation, a reminder the day before, the prescription after the visit, and a follow-up reminder 3 days before the next-visit date.

### For the doctor
- **Today**: today's appointments with check-in, Consult, no-show and cancel, the counts, and a "Follow-ups due" list (patients due within a week, or overdue, who haven't booked) with call and WhatsApp buttons.
- **Consultation screen**:
  - complaint, diagnosis and procedure
  - prescription rows with medicine autocomplete from past prescriptions, plus type, when, duration, dose and instructions
  - "Repeat last" copies the previous visit's medicines
  - advice for the patient, and private notes only doctors see
  - next visit set with one tap (1 week … 3 months)
  - option to email the prescription
- **Photos and reports**: uploaded from a phone camera and shrunk before upload. Each one can be shared with the patient or kept private.
- **Patients**: search by name or phone, full history, edit details. "Create login" or "Reset password" gives a temporary password (e.g. `skin-4821`) with a copy button and a WhatsApp share button. The patient chooses their own password on first login.

### For reception / pharmacy
- **Pharmacy desk**: a live queue of prescriptions waiting to be handed over. Search any patient by name or phone to see all their prescriptions. Tick medicines one by one, or use "Mark all handed over". The patient's portal updates to "Collected".
- **Book walk-ins and phone bookings**: existing patients are suggested as you type, and the patient can be checked in straight away.

### For the admin
- **Schedule and slots**:
  - weekly hours with any number of windows per day (e.g. 10–1 and 4–7)
  - each window has its own slot length (10 min – 2 hrs) and number of patients per slot
  - "Copy to…" copies a day to weekdays, the weekend or other days
- **Holidays and days off**: close a date or a date range. You're shown anyone already booked on those days so you can call them.
- **Staff accounts**: add doctors, reception and admins with temporary passwords. You can change roles, reset passwords and disable accounts.
- **Learn articles**: write and edit articles with a simple formatting syntax and a preview.
- **Clinic details**: name, doctor and qualifications (printed on prescriptions), phone, WhatsApp, address, maps link, how far ahead patients can book, and the minimum notice for booking.

### Privacy rules built in
- Patients only ever see their own records, and only the photos shared with them.
- Private notes and patient medical notes are shown to doctors and admins only. Reception doesn't see them.
- Someone who has booked as a guest can create their own login. Once the clinic holds prescriptions under a phone number, nobody can sign up with that number on their own. The clinic issues a temporary password instead, so knowing someone's phone number isn't enough to read their records.

## Run it locally

```bash
cd clinic
npm install                 # installs server + client
npm run seed:demo           # optional demo data
npm run build
ADMIN_PHONE=9000000001 ADMIN_PASSWORD=admin123 npm start   # http://localhost:4000
```

Demo logins (after `seed:demo`):

| Role | Phone | Password |
|---|---|---|
| Admin | 90000 00001 | admin123 |
| Doctor | 90000 00002 | doctor123 |
| Reception / pharmacy | 90000 00003 | reception123 |
| Patient | 98111 11111 | patient123 |

For development, run `npm run dev:server` (API on :4000) and `npm run dev:client` (Vite on :5173). Run the API tests with `npm test`.

## Hosting

This uses the same cheap setup as Jellyfish: [Turso](https://turso.tech) for the database (free tier) and DigitalOcean App Platform for the API (~$5/month) plus a free static site. `.do/app.yaml` is ready to use. Photos are stored in the database, so the server keeps no files and survives redeploys.

| Env var | |
|---|---|
| `JWT_SECRET` | **Required.** A long random string |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Hosted database. If they're unset, a local SQLite file is used |
| `ADMIN_PHONE`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Create the first admin on start-up |
| `TZ` | The clinic's time zone, e.g. `Asia/Kolkata`. It decides "today" and which slots have passed |
| `DEFAULT_COUNTRY_CODE` | `91` by default. Added when a 10-digit number is typed without one |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email. Works with Gmail (app password), Zoho, Brevo or SES. Without it, emails are skipped |
| `APP_URL` | Your site's address, used for the portal link in emails |
| `CORS_ORIGIN` | Only needed if the frontend is on a different domain |

## Ideas for later
- SMS/WhatsApp OTP for sign-up and password reset (needs a paid provider such as MSG91 or Twilio)
- WhatsApp Business API reminders, instead of email and click-to-chat links
- Online payments and invoices
- Multiple doctors, each with their own schedule
- Before/after photo comparison slider
