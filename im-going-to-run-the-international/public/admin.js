const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const dashboard = document.querySelector("#dashboard");
const sessionFilter = document.querySelector("#sessionFilter");
const summary = document.querySelector("#summary");
const bookingsTable = document.querySelector("#bookingsTable");
const exportButton = document.querySelector("#exportButton");
let password = localStorage.getItem("staffPassword") || "";
let state = { sessions: [], bookings: [] };

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  password = new FormData(loginForm).get("password");
  localStorage.setItem("staffPassword", password);
  await loadDashboard();
});

sessionFilter.addEventListener("change", renderBookings);
exportButton.addEventListener("click", exportCsv);

bookingsTable.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-booking]");
  if (!select) return;

  await fetch(`/api/admin/bookings/${select.dataset.booking}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ status: select.value })
  });
  await loadDashboard();
});

async function loadDashboard() {
  loginMessage.textContent = "Opening...";
  const response = await fetch("/api/admin/bookings", {
    headers: { "x-admin-password": password }
  });

  if (!response.ok) {
    loginMessage.textContent = "Password not accepted.";
    return;
  }

  state = await response.json();
  loginPanel.hidden = true;
  dashboard.hidden = false;
  loginMessage.textContent = "";
  renderFilters();
  renderSummary();
  renderBookings();
}

function renderFilters() {
  const current = sessionFilter.value || "all";
  sessionFilter.innerHTML = `
    <option value="all">All sessions</option>
    ${state.sessions.map((session) => `<option value="${escapeHtml(session.id)}">${escapeHtml(session.time)} · ${escapeHtml(session.title)}</option>`).join("")}
  `;
  sessionFilter.value = current;
}

function renderSummary() {
  const confirmed = state.bookings.filter((booking) => booking.status === "confirmed").length;
  const waitlist = state.bookings.filter((booking) => booking.status === "waitlist").length;
  const cancelled = state.bookings.filter((booking) => booking.status === "cancelled").length;
  const capacity = state.sessions.reduce((total, session) => total + Number(session.capacity), 0);

  summary.innerHTML = [
    ["Confirmed", confirmed],
    ["Waiting list", waitlist],
    ["Cancelled", cancelled],
    ["Total capacity", capacity]
  ].map(([label, value]) => `
    <article class="summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderBookings() {
  const selectedSession = sessionFilter.value || "all";
  const filtered = state.bookings
    .filter((booking) => selectedSession === "all" || booking.sessionId === selectedSession)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (filtered.length === 0) {
    bookingsTable.innerHTML = `<tr><td colspan="6">No bookings yet.</td></tr>`;
    return;
  }

  bookingsTable.innerHTML = filtered.map((booking) => {
    const session = state.sessions.find((item) => item.id === booking.sessionId);
    const statusClass = `status-pill status-${booking.status}`;
    return `
      <tr>
        <td><strong>${escapeHtml(booking.name)}</strong></td>
        <td>${escapeHtml(session ? `${session.time} · ${session.title}` : booking.sessionId)}</td>
        <td><span class="${statusClass}">${escapeHtml(booking.status)}</span></td>
        <td>
          <a href="mailto:${escapeHtml(booking.email)}">${escapeHtml(booking.email)}</a><br>
          <a href="https://wa.me/${phoneForWhatsapp(booking.phone)}">${escapeHtml(booking.phone)}</a>
        </td>
        <td>${new Date(booking.createdAt).toLocaleString()}</td>
        <td>
          <select data-booking="${escapeHtml(booking.id)}" aria-label="Update booking status">
            ${["confirmed", "waitlist", "cancelled"].map((status) => `
              <option value="${status}" ${status === booking.status ? "selected" : ""}>${status}</option>
            `).join("")}
          </select>
        </td>
      </tr>
    `;
  }).join("");
}

function exportCsv() {
  const header = ["Name", "Email", "Phone", "Session", "Status", "Booked at"];
  const rows = state.bookings.map((booking) => {
    const session = state.sessions.find((item) => item.id === booking.sessionId);
    return [
      booking.name,
      booking.email,
      booking.phone,
      session ? `${session.time} ${session.title}` : booking.sessionId,
      booking.status,
      booking.createdAt
    ];
  });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "international-yoga-day-bookings.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function phoneForWhatsapp(phone) {
  return String(phone).replace(/[^\d]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (password) {
  loadDashboard();
}
