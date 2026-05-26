# International Yoga Day Reservation System

A small one-page reservation system for free International Yoga Day classes and workshops.

## Run it

```bash
npm start
```

Open:

- Guest page: http://localhost:3000
- Staff page: http://localhost:3000/admin.html

Default staff password:

```text
yoga2026
```

Set a stronger staff password before using it publicly:

```bash
ADMIN_PASSWORD="your-strong-password" npm start
```

## Edit the schedule

Change classes, workshops, times, descriptions, locations, and capacities in:

```text
data/classes.json
```

Bookings are saved in:

```text
data/bookings.json
```

On Render, use a persistent disk and set `BOOKINGS_DIR` to the disk mount path so bookings survive redeploys.

## Notifications

To notify staff on each new booking, connect a webhook from Make, Zapier, Slack, or another automation tool and start the app with:

```bash
NOTIFY_WEBHOOK_URL="https://your-webhook-url" npm start
```

The webhook receives the booking, selected session, and a short message.

## Render settings

- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `ADMIN_PASSWORD`: your staff password
  - `BOOKINGS_DIR`: `/opt/render/project/src/storage`
  - `NOTIFY_WEBHOOK_URL`: optional notification webhook
- Disk:
  - Mount path: `/opt/render/project/src/storage`
  - Size: 1 GB is enough for this app
