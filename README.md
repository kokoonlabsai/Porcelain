# Porcelain Skin Clinic

The website and clinic app for Porcelain Skin Clinic, a dermatology and aesthetic-medicine clinic. Patients book online, see their prescriptions and next visit date on their phone, and learn about procedures and care. The doctor writes prescriptions, the pharmacy desk hands medicines over, and the admin sets the schedule.

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

### Shop
- **Online shop** at `/shop`:
  - category filter, search and product pages
  - a slide-in bag, and checkout
- **Payment:** online through Razorpay (UPI, cards, netbanking, wallets), at the clinic on pickup, or cash on delivery. Card and UPI details are entered on Razorpay's own window and never reach this server.
- **Online payment safeguards:**
  - each payment's signature is checked on the server before an order is marked paid
  - a webhook catches payments made after the customer closed the browser
  - unpaid orders give their stock back when the window is closed, or after 30 minutes, but only after checking with Razorpay that nothing was paid
  - cancelling a paid order refunds it through Razorpay
- **Delivery:** set the fee and the order value for free delivery under **Clinic details**.
- **Stock:** goes down when an order is placed and back up if it's cancelled. Prices are always taken from the database.
- **Admin → Products:** add products with photos, prices, MRP, stock and a "Doctor's pick" flag.
- **Shop orders (all staff):** move each order from New → Confirmed → Ready → Completed, or cancel it.
- **Patient portal:** patients see their orders there. Customers get an email confirmation if they gave an email.
- **Demo products:** `seed:demo` adds sample products with drawn placeholders instead of photos.

### Privacy rules built in
- Patients only ever see their own records, and only the photos shared with them.
- Private notes and patient medical notes are shown to doctors and admins only. Reception doesn't see them.
- Someone who has booked as a guest can create their own login. Once the clinic holds prescriptions under a phone number, nobody can sign up with that number on their own. The clinic issues a temporary password instead, so knowing someone's phone number isn't enough to read their records.

## Run it locally

You need MongoDB 5.0 or later: a local `mongod`, or a free Atlas cluster. The app connects to `mongodb://127.0.0.1:27017/clinic` unless you set `MONGODB_URI`.

```bash
npm install                 # installs server + client
npm run seed:demo           # optional demo data
npm run build
ADMIN_PHONE=9000000001 ADMIN_PASSWORD=admin123 npm start   # http://localhost:4000
```

To use Atlas locally too, put `MONGODB_URI=mongodb+srv://…/clinic` in front of each command.

Demo logins (after `seed:demo`):

| Role | Phone | Password |
|---|---|---|
| Admin | 90000 00001 | admin123 |
| Doctor (Dr. Mayank Bajpai) | 90000 00002 | doctor123 |
| Doctor (Dr. Nitya Bajpai) | 90000 00004 | doctor123 |
| Reception / pharmacy | 90000 00003 | reception123 |
| Patient | 98111 11111 | patient123 |

For development, run `npm run dev:server` (API on :4000) and `npm run dev:client` (Vite on :5173). Run the API tests with `npm test`. They use a throwaway database on `MONGODB_URI` if it's set (dropped afterwards); otherwise they start an in-memory MongoDB, which is downloaded the first time.

## Hosting

This uses a cheap setup: [MongoDB Atlas](https://www.mongodb.com/atlas) for the database (the free M0 cluster is plenty to start), and DigitalOcean App Platform for the API (~$5/month) plus a free static site. `.do/app.yaml` is ready to use. Photos are stored in MongoDB, so the server keeps no files and survives redeploys.

**Setting up Atlas**
1. Create a free cluster, then a database user under **Database Access**.
2. Under **Network Access**, allow your server's IP address. On DigitalOcean App Platform, which has no fixed IP, allow `0.0.0.0/0`.
3. Go to **Connect → Drivers** and copy the connection string. Add the database name after the host: `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/clinic?retryWrites=true&w=majority`.
4. Set that as `MONGODB_URI`. Collections, indexes, default opening hours and the starter articles are created on the first start.

**How the data is stored**

| Collection | What's in it |
|---|---|
| `users` | Patients and staff. `role` is `patient`, `doctor`, `reception` or `admin` |
| `appointments` | Bookings, with `patient_id`, `date`, `start_time` and `status` |
| `visits` | Consultations. The prescription is an `items` array inside each visit, and each medicine has its own `dispensed` flag |
| `attachments` | Photos and PDFs, stored as binary (up to 6 MB each) |
| `availability`, `closures` | Weekly opening windows and days off |
| `articles` | Learn articles |
| `products`, `orders` | Shop products (photo stored as binary) and orders (items copied at the price paid) |
| `settings` | One document (`_id: "clinic"`) with the clinic details |

| Env var | |
|---|---|
| `JWT_SECRET` | **Required.** A long random string |
| `MONGODB_URI` | **Required in production.** Atlas or other MongoDB connection string. Defaults to `mongodb://127.0.0.1:27017/clinic` |
| `MONGODB_DB` | Optional. Overrides the database name in the URI |
| `ADMIN_PHONE`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Create the first admin on start-up |
| `TZ` | The clinic's time zone, e.g. `Asia/Kolkata`. It decides "today" and which slots have passed |
| `DEFAULT_COUNTRY_CODE` | `91` by default. Added when a 10-digit number is typed without one |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email. Works with Gmail (app password), Zoho, Brevo or SES. Without it, emails are skipped |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments in the shop (see Razorpay setup below) |
| `APP_URL` | Your site's address, used for the portal link in emails |
| `CORS_ORIGIN` | Only needed if the frontend is on a different domain |

## Razorpay setup

1. Sign up at [razorpay.com](https://razorpay.com) in the clinic's name and complete KYC. While you wait, you can use **Test mode**.
2. Go to **Account & Settings → API keys**, generate a key, and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the server. Test keys start with `rzp_test_` and live keys with `rzp_live_`.
3. Go to **Webhooks → Add new webhook**:
   - URL: `https://<your-site>/api/shop/razorpay/webhook`
   - Events: `payment.captured` and `order.paid`
   - Choose a secret, and set the same value as `RAZORPAY_WEBHOOK_SECRET`.
4. Under **Payment capture**, keep automatic capture on. That's the default.

"Pay online" appears at checkout as soon as the keys are set. Without them, the shop offers pay-at-clinic and cash on delivery only.

## Ideas for later
- SMS/WhatsApp OTP for sign-up and password reset (needs a paid provider such as MSG91 or Twilio)
- WhatsApp Business API reminders, instead of email and click-to-chat links
- Invoices / GST receipts for shop orders
- Multiple doctors, each with their own schedule
- Before/after photo comparison slider
