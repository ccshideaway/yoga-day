const sessionsEl = document.querySelector("#sessions");
const dialog = document.querySelector("#bookingDialog");
const form = document.querySelector("#bookingForm");
const formMessage = document.querySelector("#formMessage");
const dialogMeta = document.querySelector("#dialogMeta");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogDescription = document.querySelector("#dialogDescription");
let sessions = [];

async function loadSessions() {
  sessionsEl.innerHTML = "<p>Loading schedule...</p>";
  const response = await fetch("/api/sessions");
  sessions = await response.json();
  renderSessions();
}

function renderSessions() {
  sessionsEl.innerHTML = sessions.map((session) => {
    const buttonLabel = session.isFull ? "Join waiting list" : "Reserve";
    const buttonClass = session.isFull ? "primary-button waitlist-button" : "primary-button";
    const capacity = session.isFull
      ? `Full · ${session.waitlist} on waiting list`
      : `${session.remaining} of ${session.capacity} places available`;

    return `
      <article class="session-card">
        <div class="time-block">
          <strong>${escapeHtml(session.time)}</strong>
          <span>${escapeHtml(session.duration)}</span>
        </div>
        <div class="session-content">
          <p class="eyebrow">${escapeHtml(session.type)}</p>
          <h3>${escapeHtml(session.title)}</h3>
          <p class="session-description">${escapeHtml(session.description)}</p>
          <p class="session-meta">${escapeHtml(session.teacher)} · ${escapeHtml(session.location)}</p>
          <div class="tag-row">
            <span class="tag">${escapeHtml(session.level)}</span>
            <span class="tag">${escapeHtml(capacity)}</span>
          </div>
          <button class="${buttonClass}" data-session="${escapeHtml(session.id)}" type="button">${buttonLabel}</button>
        </div>
      </article>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

sessionsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-session]");
  if (!button) return;
  const session = sessions.find((item) => item.id === button.dataset.session);
  form.reset();
  form.sessionId.value = session.id;
  formMessage.textContent = "";
  dialogMeta.textContent = `${session.time} · ${session.duration} · ${session.location}`;
  dialogTitle.textContent = session.isFull ? `Join waiting list: ${session.title}` : `Reserve: ${session.title}`;
  dialogDescription.textContent = session.isFull
    ? "This session is currently full. Add your details and we will place you on the waiting list."
    : session.description;
  form.querySelector("button[type='submit']").textContent = session.isFull ? "Join waiting list" : "Reserve";
  dialog.showModal();
});

document.querySelector(".close-button").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "Sending...";
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const result = await response.json();

    if (!response.ok) {
      formMessage.textContent = result.error || "Please check your details and try again.";
      return;
    }

    formMessage.textContent = result.message;
    await loadSessions();
    setTimeout(() => dialog.close(), 1600);
  } catch (error) {
    formMessage.textContent = "Could not send your reservation. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
});

loadSessions();
