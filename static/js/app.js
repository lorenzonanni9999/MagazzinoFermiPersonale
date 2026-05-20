async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;



    const res = await fetch("/api/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ email, password })
    });

    if (res.status === 200) {
        location.href = "home.html";
        return;
    }
    const data = await res.json();
    alert(data.error || "Credenziali non valide.");
}

async function registerUser() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const ruolo = document.getElementById("ruolo").value;

    const res = await fetch("/api/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ email, password, ruolo })
    });

    const data = await res.json();
    alert(data.message || data.error);

    if (res.status === 201)
        location.href = "login.html";
}

async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "login.html";
}

async function loadTasks() {
    const res = await fetch("/api/tasks");

    if (res.status !== 200) {
        location.href = "login.html";
        return;
    }

    const data = await res.json();
    const list = document.getElementById("taskList");
    list.innerHTML = "";

    data.items.forEach(t => {
        const li = document.createElement("li");

        // Header (email + ora)
        const header = document.createElement("div");
        header.className = "header";

        const textEmail = document.createElement("span");
        textEmail.className = "user";
        textEmail.textContent = t.email;

        const textOra = document.createElement("span");
        textOra.className = "ora";
        textOra.textContent = t.ora;

        header.appendChild(textEmail);
        header.appendChild(textOra);

        // Testo
        const textSpan = document.createElement("span");
        textSpan.className = "text";
        textSpan.textContent = t.text;

        // Azioni
        const actions = document.createElement("div");
        actions.className = "actions";

        if (t.mio) {
            const del = document.createElement("button");
            del.className = "icon-btn";
            del.innerHTML = '<i class="fa-solid fa-trash"></i>';
            del.onclick = () => deleteTask(t.id);
            actions.appendChild(del);

            li.classList.add("mine");
        }

        li.appendChild(header);
        li.appendChild(textSpan);
        li.appendChild(actions);

        list.appendChild(li);
    });
}

async function addUtente() {
    //const input = document.getElementById("taskText");
    //const text = input.value.trim();
    //if (!text) return;

    //await fetch("/api/tasks", {
    //    method: "POST",
    //    headers: {"Content-Type": "application/json"},
    //    body: JSON.stringify({ text })
    //});

    //input.value = "";
    //loadTasks();


    location.href = "register.html";
}

async function deleteTask(id) {
    await fetch(`/api/tasks/${id}/delete`, { method: "DELETE" });
    loadTasks();
}

if (location.pathname.endsWith("tasks.html"))
    loadTasks();
