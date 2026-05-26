import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const root = resolve(".");
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const bookingsDir = process.env.BOOKINGS_DIR || dataDir;
const classesPath = join(dataDir, "classes.json");
const bookingsPath = join(bookingsDir, "bookings.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const adminPassword = process.env.ADMIN_PASSWORD || "yoga2026";
const notifyWebhookUrl = process.env.NOTIFY_WEBHOOK_URL || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

await mkdir(bookingsDir, { recursive: true });
if (!existsSync(bookingsPath)) {
  await writeJson(bookingsPath, []);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  if (Buffer.isBuffer(body) || typeof body === "string") {
    res.end(body);
    return;
  }
  res.end(JSON.stringify(body));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

function normalize(value) {
  return String(value || "").trim();
}

function validateBooking(input) {
  const name = normalize(input.name);
  const email = normalize(input.email).toLowerCase();
  const phone = normalize(input.phone);
  const sessionId = normalize(input.sessionId);

  if (!sessionId) return { error: "Please choose a class or workshop." };
  if (name.length < 2) return { error: "Please enter your full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (phone.length < 6) return { error: "Please enter your WhatsApp or mobile number." };

  return { value: { name, email, phone, sessionId } };
}

function requireAdmin(req, res) {
  if (req.headers["x-admin-password"] === adminPassword) return true;
  send(res, 401, { error: "Staff password required." });
  return false;
}

function countBookings(bookings, sessionId, status) {
  return bookings.filter((booking) => booking.sessionId === sessionId && booking.status === status).length;
}

function withCounts(classes, bookings) {
  return classes.map((session) => {
    const confirmed = countBookings(bookings, session.id, "confirmed");
    const waitlist = countBookings(bookings, session.id, "waitlist");
    return {
      ...session,
      confirmed,
      waitlist,
      remaining: Math.max(session.capacity - confirmed, 0),
      isFull: confirmed >= session.capacity
    };
  }).sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}

async function notifyStaff(booking, session) {
  if (!notifyWebhookUrl) return;

  try {
    await fetch(notifyWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "new_booking",
        booking,
        session,
        message: `${booking.name} ${booking.status === "confirmed" ? "booked" : "joined the waiting list for"} ${session.title}.`
      })
    });
  } catch (error) {
    console.error("Notification webhook failed:", error.message);
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const [classes, bookings] = await Promise.all([readJson(classesPath, []), readJson(bookingsPath, [])]);
    send(res, 200, withCounts(classes, bookings));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const input = await readBody(req);
    const validation = validateBooking(input);
    if (validation.error) {
      send(res, 400, { error: validation.error });
      return;
    }

    const [classes, bookings] = await Promise.all([readJson(classesPath, []), readJson(bookingsPath, [])]);
    const session = classes.find((item) => item.id === validation.value.sessionId);
    if (!session) {
      send(res, 404, { error: "This class or workshop is no longer available." });
      return;
    }

    const duplicate = bookings.find((booking) => (
      booking.sessionId === session.id &&
      booking.email === validation.value.email &&
      booking.status !== "cancelled"
    ));
    if (duplicate) {
      send(res, 409, { error: "You already have a reservation for this class or workshop." });
      return;
    }

    const confirmed = countBookings(bookings, session.id, "confirmed");
    const status = confirmed >= session.capacity ? "waitlist" : "confirmed";
    const booking = {
      id: randomUUID(),
      ...validation.value,
      status,
      createdAt: new Date().toISOString()
    };

    bookings.push(booking);
    await writeJson(bookingsPath, bookings);
    await notifyStaff(booking, session);

    send(res, 201, {
      booking,
      session,
      message: status === "confirmed"
        ? "Your reservation is confirmed. We look forward to seeing you on 21 June."
        : "This session is full, so you have been added to the waiting list."
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/bookings") {
    if (!requireAdmin(req, res)) return;
    const [classes, bookings] = await Promise.all([readJson(classesPath, []), readJson(bookingsPath, [])]);
    send(res, 200, { sessions: withCounts(classes, bookings), bookings });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/bookings/")) {
    if (!requireAdmin(req, res)) return;
    const id = url.pathname.split("/").pop();
    const input = await readBody(req);
    const bookings = await readJson(bookingsPath, []);
    const index = bookings.findIndex((booking) => booking.id === id);
    if (index === -1) {
      send(res, 404, { error: "Booking not found." });
      return;
    }

    if (!["confirmed", "waitlist", "cancelled"].includes(input.status)) {
      send(res, 400, { error: "Invalid booking status." });
      return;
    }

    bookings[index] = { ...bookings[index], status: input.status, updatedAt: new Date().toISOString() };
    await writeJson(bookingsPath, bookings);
    send(res, 200, bookings[index]);
    return;
  }

  send(res, 404, { error: "Not found." });
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDir, `.${requested}`);
  if (!filePath.startsWith(publicDir)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const file = await readFile(filePath);
    send(res, 200, file, contentTypes[extname(filePath)] || "application/octet-stream");
  } catch (error) {
    if (error.code === "ENOENT") {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    throw error;
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "Something went wrong. Please try again." });
  }
}).listen(port, host, () => {
  console.log(`International Yoga Day reservations: http://${host}:${port}`);
  console.log(`Staff page: http://${host}:${port}/admin.html`);
});
