(() => {
  "use strict";

  const statuses = ["to_do", "pending", "in_progress", "done"];
  const labels = {
    to_do: "To do",
    pending: "Pending",
    in_progress: "In progress",
    done: "Done",
  };

  const actorInput = document.getElementById("demo-actor");
  const targetInput = document.getElementById("demo-target");
  const expectedInput = document.getElementById("demo-expected");
  const currentBadge = document.getElementById("demo-current-badge");
  const response = document.getElementById("demo-response");
  const logList = document.getElementById("demo-logs");
  const logCount = document.getElementById("demo-log-count");
  const submitButton = document.getElementById("demo-submit");
  const deleteButton = document.getElementById("demo-delete");
  const resetButton = document.getElementById("demo-reset");

  let current = "to_do";
  let deleted = false;
  let logs = [];

  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function showResponse(message, kind = "success") {
    response.textContent = message;
    response.className = `response-message${kind === "success" ? "" : ` ${kind}`}`;
  }

  function renderLogs() {
    logList.replaceChildren();
    logCount.textContent = `${logs.length} entri`;
    if (logs.length === 0) {
      const empty = document.createElement("li");
      empty.className = "no-log";
      empty.textContent = "Belum ada log. Ubah status ke Pending untuk membuat entri pertama.";
      logList.append(empty);
      return;
    }

    for (const log of logs) {
      const item = document.createElement("li");
      const description = document.createElement("span");
      description.textContent = `#${log.sequence} · ${log.actorId} mengubah Prepare invoice dari ${labels[log.fromStatus]} ke ${labels[log.toStatus]}.`;
      const time = document.createElement("time");
      time.className = "log-time";
      time.dateTime = log.createdAt;
      time.textContent = dateFormatter.format(new Date(log.createdAt));
      item.append(description, time);
      logList.append(item);
    }
  }

  function renderTask() {
    currentBadge.textContent = deleted ? `Deleted · ${labels[current]}` : labels[current];
    currentBadge.className = `demo-badge ${deleted ? "deleted" : current}`;
    submitButton.disabled = deleted;
    deleteButton.disabled = deleted;
    renderLogs();
  }

  submitButton.addEventListener("click", () => {
    const target = targetInput.value;
    const expectedStatus = expectedInput.value;
    const actorId = actorInput.value;

    if (deleted) {
      showResponse("404: task sudah dihapus dan tidak dapat diubah lagi.", "error");
      return;
    }
    if (target === current) {
      showResponse(`200: status sudah ${labels[current]}. changed: false. Tidak ada audit log baru.`, "neutral");
      return;
    }
    if (expectedStatus !== current) {
      showResponse(`409: status yang dilihat UI (${labels[expectedStatus]}) sudah berbeda dari status task (${labels[current]}). Muat data terbaru.`, "error");
      return;
    }
    if (statuses.indexOf(target) !== statuses.indexOf(current) + 1) {
      showResponse(`409: dari ${labels[current]} hanya boleh maju satu langkah${current === "done" ? "; task sudah selesai" : ` ke ${labels[statuses[statuses.indexOf(current) + 1]]}`}. Status dan log tidak berubah.`, "error");
      return;
    }

    const previous = current;
    const createdAt = new Date().toISOString();
    current = target;
    logs.push({
      sequence: logs.length + 1,
      actorId,
      fromStatus: previous,
      toStatus: target,
      createdAt,
    });
    expectedInput.value = current;
    targetInput.value = current;
    renderTask();
    showResponse(`200: status berubah dari ${labels[previous]} ke ${labels[current]}. changed: true. Satu audit log baru ditambahkan.`);
  });

  deleteButton.addEventListener("click", () => {
    deleted = true;
    renderTask();
    showResponse(`200: task dihapus secara soft delete. ${logs.length} audit log tetap tersedia.`, "neutral");
  });

  resetButton.addEventListener("click", () => {
    current = "to_do";
    deleted = false;
    logs = [];
    targetInput.value = "pending";
    expectedInput.value = "to_do";
    actorInput.value = "john.doe";
    renderTask();
    showResponse("Task baru dimulai dari to_do. Belum ada perubahan status.", "neutral");
  });

  targetInput.value = "pending";
  renderTask();

  const answers = {
    q1: { correct: "b", explanation: "Idempotensi berarti request yang menghasilkan status sama tidak menambah audit log." },
    q2: { correct: "c", explanation: "Alur hanya boleh maju satu langkah. Request ilegal tidak mengubah task maupun log." },
    q3: { correct: "a", explanation: "Status task dan log merupakan satu perubahan logis; keduanya harus tersimpan bersama." },
    q4: { correct: "b", explanation: "Beberapa proses dapat membaca snapshot yang sama dan penulisan terakhir menimpa yang lain." },
  };

  const quiz = document.getElementById("quiz-form");
  const quizResult = document.getElementById("quiz-result");

  quiz.addEventListener("submit", (event) => {
    event.preventDefault();
    let score = 0;
    let unanswered = 0;
    for (const [question, answer] of Object.entries(answers)) {
      const selected = quiz.querySelector(`input[name="${question}"]:checked`);
      const feedback = document.getElementById(`feedback-${question}`);
      feedback.hidden = false;
      if (!selected) {
        unanswered++;
        feedback.className = "quiz-feedback incorrect";
        feedback.textContent = "Pilih satu jawaban terlebih dahulu.";
      } else {
        const isCorrect = selected.value === answer.correct;
        if (isCorrect) score++;
        feedback.className = `quiz-feedback${isCorrect ? "" : " incorrect"}`;
        feedback.textContent = `${isCorrect ? "Benar." : "Belum tepat."} ${answer.explanation}`;
      }
    }
    quizResult.hidden = false;
    quizResult.textContent = unanswered
      ? `${unanswered} pertanyaan belum dijawab. Skor sementara: ${score} dari 4.`
      : `Skor: ${score} dari 4. ${score === 4 ? "Kamu siap menjelaskan invarian dan trade-off solusi ini." : "Baca pembahasan, lalu coba lagi."}`;
  });

  quiz.addEventListener("reset", () => {
    window.setTimeout(() => {
      quizResult.hidden = true;
      for (const question of Object.keys(answers)) {
        document.getElementById(`feedback-${question}`).hidden = true;
      }
    }, 0);
  });

  const progressFill = document.getElementById("reading-progress-fill");
  const chapters = [...document.querySelectorAll(".chapter")];
  const navigationLinks = [...document.querySelectorAll(".sidebar nav a")];
  let scrollScheduled = false;

  function updateReadingPosition() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const fraction = scrollable > 0 ? window.scrollY / scrollable : 0;
    progressFill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;

    let active = chapters[0].id;
    for (const chapter of chapters) {
      if (chapter.getBoundingClientRect().top <= 150) active = chapter.id;
    }
    for (const link of navigationLinks) {
      const isActive = link.getAttribute("href") === `#${active}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    scrollScheduled = false;
  }

  window.addEventListener("scroll", () => {
    if (!scrollScheduled) {
      scrollScheduled = true;
      window.requestAnimationFrame(updateReadingPosition);
    }
  }, { passive: true });
  window.addEventListener("resize", updateReadingPosition);
  updateReadingPosition();
})();
