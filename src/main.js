import "./style.css";
import { supabase } from "./supabase";

const app = document.querySelector("#app");

const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
};

function isAdmin(email) {
  return (email || "").endsWith("@admin.mydomain.com");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let session = null;

function nav(active) {
  return `
    <header class="top">
      <div class="brand">
        <div class="logo"></div>
        <div>
          <div class="title">TP — Posts & Comments</div>
          <div class="sub">Supabase Auth + RLS + Realtime</div>
        </div>
      </div>

      <nav class="nav">
        <a class="${active==="home"?"active":""}" href="#/">Home</a>
        <a class="${active==="stats"?"active":""}" href="#/stats">Statistics</a>
        <a class="${active==="account"?"active":""}" href="#/account">Account</a>
      </nav>

      <div class="chip" style="${session ? "" : "display:none;"}">
        <span>${session?.user?.email ?? ""}</span>
        <span class="badge" style="${isAdmin(session?.user?.email) ? "" : "display:none;"}">Admin</span>
        <button id="btnLogout" class="btn">Logout</button>
      </div>
    </header>
  `;
}

async function loadFeed() {
  const { data: posts } = await supabase
    .from("posts")
    .select("id,title,content,created_at")
    .order("created_at", { ascending: false });

  const { data: comments } = await supabase
    .from("comments")
    .select("id,post_id,content,created_at")
    .order("created_at", { ascending: true });

  const byPost = {};
  for (const c of comments || []) (byPost[c.post_id] ||= []).push(c);

  return { posts: posts || [], commentsByPost: byPost };
}

function renderHomeUI(feed) {
  const admin = isAdmin(session?.user?.email);
  const can = !!session;

  const node = el(`
    <div class="page">
      ${nav("home")}

      <section class="card" style="${can ? "" : "display:none;"}">
        <h2>Create post</h2>
        <div class="row">
          <input id="title" placeholder="Title" />
        </div>
        <div class="row">
          <textarea id="content" rows="4" placeholder="Content"></textarea>
        </div>
        <div class="row">
          <button id="btnPost" class="btn primary">Publish</button>
          <span id="msg" class="muted"></span>
        </div>
      </section>

      <section class="card">
        <h2>Posts</h2>
        <div id="posts" class="posts"></div>
      </section>
    </div>
  `);

  const postsEl = node.querySelector("#posts");

  postsEl.innerHTML = feed.posts
    .map((p) => {
      const comments = feed.commentsByPost[p.id] || [];
      return `
        <article class="post">
          <div class="postHead">
            <div>
              <h3>${escapeHtml(p.title)}</h3>
              <div class="content">${escapeHtml(p.content)}</div>
              <div class="meta">${new Date(p.created_at).toLocaleString()}</div>
            </div>
            ${
              admin
                ? `<button class="btn danger" data-action="del-post" data-id="${p.id}">Delete</button>`
                : ""
            }
          </div>

          <div class="comments">
            <div class="muted"><b>Comments</b> (${comments.length})</div>
            ${comments
              .map(
                (c) => `
                  <div class="comment">
                    <div>${escapeHtml(c.content)}</div>
                    <div class="meta">${new Date(c.created_at).toLocaleString()}</div>
                    ${
                      admin
                        ? `<button class="btn danger" data-action="del-comment" data-id="${c.id}">Delete</button>`
                        : ""
                    }
                  </div>
                `
              )
              .join("")}

            <div class="row">
              <input data-action="c-input" data-post-id="${p.id}" placeholder="${
        can ? "Write a comment..." : "Login to comment"
      }" ${can ? "" : "disabled"} />
              <button class="btn primary" data-action="c-send" data-post-id="${p.id}" ${
        can ? "" : "disabled"
      }>Send</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  node.querySelector("#btnPost")?.addEventListener("click", async () => {
    const title = node.querySelector("#title").value.trim();
    const content = node.querySelector("#content").value.trim();
    if (!title || !content) return;

    const { error } = await supabase.from("posts").insert([{ title, content }]);
    node.querySelector("#msg").textContent = error ? error.message : "Posted ✅";
  });

  postsEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = Number(btn.dataset.id);

    if (action === "del-post") {
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) alert(error.message);
    }
    if (action === "del-comment") {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) alert(error.message);
    }
    if (action === "c-send") {
      const postId = Number(btn.dataset.postId);
      const input = postsEl.querySelector(`input[data-action="c-input"][data-post-id="${postId}"]`);
      const text = input.value.trim();
      if (!text) return;

      const { error } = await supabase.from("comments").insert([{ post_id: postId, content: text }]);
      if (error) alert(error.message);
      input.value = "";
    }
  });

  node.querySelector("#btnLogout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  return node;
}

function renderAccount() {
  const node = el(`
    <div class="page">
      ${nav("account")}
      <section class="card">
        <h2>Login / Register</h2>

        <div class="row">
          <input id="email" placeholder="Email" />
          <input id="password" type="password" placeholder="Password" />
        </div>

        <div class="row">
          <button id="btnLogin" class="btn primary">Login</button>
          <button id="btnRegister" class="btn">Register</button>
          <span id="authMsg" class="muted"></span>
        </div>

        <p class="muted" style="margin-top:10px;">
          Admins are emails ending with <b>@admin.mydomain.com</b>.
        </p>
      </section>
    </div>
  `);

  node.querySelector("#btnLogout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  node.querySelector("#btnLogin").addEventListener("click", async () => {
    const email = node.querySelector("#email").value.trim();
    const password = node.querySelector("#password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    node.querySelector("#authMsg").textContent = error ? error.message : "Login OK ✅";
    if (!error) location.hash = "#/";
  });

  node.querySelector("#btnRegister").addEventListener("click", async () => {
    const email = node.querySelector("#email").value.trim();
    const password = node.querySelector("#password").value;
    const { error } = await supabase.auth.signUp({ email, password });
    node.querySelector("#authMsg").textContent = error ? error.message : "Registered ✅";
  });

  return node;
}

async function renderStats() {
  const node = el(`
    <div class="page">
      ${nav("stats")}
      <section class="card">
        <h2>Statistics</h2>
        <div class="grid3">
          <div class="stat"><div class="muted">Total posts</div><div id="s1" class="big">—</div></div>
          <div class="stat"><div class="muted">Avg comments / post</div><div id="s2" class="big">—</div></div>
          <div class="stat"><div class="muted">Avg posts / user</div><div id="s3" class="big">—</div></div>
        </div>
        <div id="sm" class="muted" style="margin-top:10px;"></div>
      </section>
    </div>
  `);

  node.querySelector("#btnLogout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  const { data: posts, error: pErr } = await supabase.from("posts").select("id,user_id");
  if (pErr) { node.querySelector("#sm").textContent = pErr.message; return node; }

  const { data: comments, error: cErr } = await supabase.from("comments").select("id,post_id");
  if (cErr) { node.querySelector("#sm").textContent = cErr.message; return node; }

  const totalPosts = posts.length;
  const avgComments = comments.length / (totalPosts || 1);
  const users = new Set(posts.map(p => p.user_id));
  const avgPosts = totalPosts / (users.size || 1);

  node.querySelector("#s1").textContent = totalPosts;
  node.querySelector("#s2").textContent = avgComments.toFixed(2);
  node.querySelector("#s3").textContent = avgPosts.toFixed(2);

  return node;
}

async function router() {
  app.innerHTML = "";

  const { data } = await supabase.auth.getSession();
  session = data.session;

  const route = location.hash || "#/";
  if (route === "#/account") {
    app.appendChild(renderAccount());
    return;
  }
  if (route === "#/stats") {
    app.appendChild(await renderStats());
    return;
  }

  const feed = await loadFeed();
  app.appendChild(renderHomeUI(feed));
}

function setupRealtime() {
  supabase
    .channel("realtime-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, router)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, router)
    .subscribe();
}

window.addEventListener("hashchange", router);

supabase.auth.onAuthStateChange(() => router());

setupRealtime();
router();