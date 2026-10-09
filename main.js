(() => {
      "use strict";
      const $ = (selector, root = document) => root.querySelector(selector);
      const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
      const CONFIG_KEY = "portech.supabase.config";
      const SESSION_KEY = "portech.supabase.session";
      const DRAFT_KEY = "portech.portfolio.draft";
      const state = { config: null, session: null, portfolioId: null, template: "simple", avatar: "", portfolios: [], authMode: "login", toastTimer: null };
      const sectionNames = { education: "Education", skills: "Skills", projects: "Projects", experience: "Work experience", links: "Links" };

      function toast(message, isError = false) {
        const element = $("#toast");
        element.textContent = message;
        element.classList.toggle("error", isError);
        element.classList.remove("hidden");
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => element.classList.add("hidden"), 4200);
      }
      function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
      }
      function safeUrl(value) {
        try {
          const url = new URL(value);
          return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
        } catch { return ""; }
      }
      function openModal(id) { $("#" + id).classList.remove("hidden"); }
      function closeModal(id) { $("#" + id).classList.add("hidden"); }
      function setConnected(connected) {
        $("#cloudDot").classList.toggle("connected", connected);
        $("#cloudLabel").textContent = connected ? "Cloud connected" : "Cloud not connected";
      }
      function draftKey() {
        return state.session?.user?.id ? DRAFT_KEY + "." + state.session.user.id : DRAFT_KEY;
      }
      function setAuthUI() {
        const signedIn = Boolean(state.session?.access_token);
        $("#logoutButton").classList.toggle("hidden", !signedIn);
        $("#loginButton").textContent = signedIn ? "My workspace" : "Log in";
        $("#signupButton").textContent = signedIn ? "New portfolio" : "Get started";
        $("#listStatus").textContent = signedIn ? "Synced" : "";
        setConnected(Boolean(state.config));
        $("#builder").classList.toggle("hidden", !signedIn);
      }
      function loadSavedConfig() {
        let savedConfig = null;
        try { savedConfig = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch { savedConfig = null; }
        const publishedConfig = window.PORTECH_SUPABASE;
        state.config = savedConfig?.url && savedConfig?.key
          ? savedConfig
          : publishedConfig?.url && publishedConfig?.anonKey
            ? { url: publishedConfig.url, key: publishedConfig.anonKey }
            : null;
        try { state.session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { state.session = null; }
        if (state.config && (!state.config.url || !state.config.key)) state.config = null;
        if (state.session?.expires_at && state.session.expires_at < Date.now() / 1000) {
          state.session = null;
          localStorage.removeItem(SESSION_KEY);
        }
        setAuthUI();
      }
      function supabaseUrl(path) { return state.config.url.replace(/\/+$/, "") + path; }
      async function request(path, options = {}, authenticated = true) {
        if (!state.config) throw new Error("Connect your Supabase database first.");
        const headers = new Headers(options.headers || {});
        headers.set("apikey", state.config.key);
        if (authenticated && state.session?.access_token) headers.set("Authorization", "Bearer " + state.session.access_token);
        else headers.set("Authorization", "Bearer " + state.config.key);
        if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
        const response = await fetch(supabaseUrl(path), { ...options, headers });
        const text = await response.text();
        let result = null;
        if (text) {
          try { result = JSON.parse(text); } catch { result = text; }
        }
        if (!response.ok) {
          if (response.status === 401 && authenticated) {
            state.session = null;
            localStorage.removeItem(SESSION_KEY);
            setAuthUI();
          }
          const message = result?.message || result?.msg || result?.error_description || result?.error || (typeof result === "string" ? result : "Request failed (" + response.status + ").");
          throw new Error(message);
        }
        return result;
      }
      function showAuth(mode = "login") {
        state.authMode = mode;
        const signup = mode === "signup";
        $("#authTitle").textContent = signup ? "Make a little space." : "Welcome back.";
        $("#authDescription").textContent = signup ? "Create an account to save and share your portfolio." : "Log in to open your portfolio workspace.";
        $("#authSubmit").textContent = signup ? "Create account" : "Log in";
        $("#nameField").classList.toggle("hidden", !signup);
        $("#authName").required = signup;
        $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
        $("#authSwitch").innerHTML = signup ? 'Already have an account? <button type="button" class="text-button" id="switchAuth">Log in</button>' : 'New to Portech? <button type="button" class="text-button" id="switchAuth">Create an account</button>';
        $("#switchAuth").addEventListener("click", () => showAuth(signup ? "login" : "signup"), { once: true });
        $("#authSetupNote").textContent = state.config ? "Your portfolio is stored in your connected cloud database. Sign in to manage it." : "Connect Supabase in Database setup first. Your account and portfolio data will be stored online.";
        $("#authDatabaseButton").classList.toggle("hidden", Boolean(state.config));
        openModal("authModal");
      }
      function revealBuilder() {
        $("#builder").classList.remove("hidden");
        $("#builder").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      function blankProfile() {
        return { title: "", fullName: "", email: "", phone: "", address: "", about: "", avatar: "", education: [], skills: [], projects: [], experience: [], links: [] };
      }
      function addRepeatRow(type, values = {}) {
        const list = $("#" + type + "List");
        const row = document.createElement("div");
        const single = type === "skills";
        row.className = "repeat-row" + (single ? " single" : "");
        row.dataset.type = type;
        if (single) {
          row.innerHTML = '<input aria-label="Skill" maxlength="80" placeholder="e.g. User research" value="' + escapeHTML(typeof values === "string" ? values : "") + '"><button class="remove-row" type="button" aria-label="Remove skill">×</button>';
        } else {
          const first = type === "education" ? (values.school || "") : type === "projects" ? (values.name || "") : type === "experience" ? (values.role || "") : (values.label || "");
          const second = type === "education" ? (values.degree || "") : type === "projects" ? (values.url || "") : type === "experience" ? (values.company || "") : (values.url || "");
          const firstLabel = type === "education" ? "School or institution" : type === "projects" ? "Project name" : type === "experience" ? "Role or position" : "Link label";
          const secondLabel = type === "education" ? "Degree or course" : type === "projects" ? "Project URL (optional)" : type === "experience" ? "Company or organization" : "Website URL";
          const description = type === "education" ? (values.details || "") : type === "projects" ? (values.description || "") : type === "experience" ? (values.details || "") : "";
          row.innerHTML = '<input aria-label="' + firstLabel + '" maxlength="160" placeholder="' + firstLabel + '" value="' + escapeHTML(first) + '"><input aria-label="' + secondLabel + '" maxlength="500" placeholder="' + secondLabel + '" value="' + escapeHTML(second) + '"><button class="remove-row" type="button" aria-label="Remove ' + sectionNames[type] + ' item">×</button>' + (type === "links" ? "" : '<textarea aria-label="Details" maxlength="1000" placeholder="' + (type === "projects" ? "What did you make? What was your role?" : "Dates, details, or a little more context") + '">' + escapeHTML(description) + '</textarea>');
        }
        row.addEventListener("input", () => { updateDraftFromForm(); renderPreview(); });
        $(".remove-row", row).addEventListener("click", () => { row.remove(); updateDraftFromForm(); renderPreview(); });
        list.appendChild(row);
      }
      function readRows(type) {
        return $$("#" + type + "List .repeat-row").map(row => {
          const inputs = $$("input", row);
          const detail = $("textarea", row)?.value.trim() || "";
          if (type === "skills") return inputs[0].value.trim();
          if (type === "education") return { school: inputs[0].value.trim(), degree: inputs[1].value.trim(), details: detail };
          if (type === "projects") return { name: inputs[0].value.trim(), url: inputs[1].value.trim(), description: detail };
          if (type === "experience") return { role: inputs[0].value.trim(), company: inputs[1].value.trim(), details: detail };
          return { label: inputs[0].value.trim(), url: inputs[1].value.trim() };
        }).filter(item => typeof item === "string" ? item : Object.values(item).some(Boolean));
      }
      function readForm() {
        return {
          title: $("#portfolioTitle").value.trim(),
          fullName: $("#fullName").value.trim(),
          email: $("#email").value.trim(),
          phone: $("#phone").value.trim(),
          address: $("#address").value.trim(),
          about: $("#aboutMe").value.trim(),
          avatar: state.avatar,
          education: readRows("education"),
          skills: readRows("skills"),
          projects: readRows("projects"),
          experience: readRows("experience"),
          links: readRows("links")
        };
      }
      function updateDraftFromForm() {
        try { localStorage.setItem(draftKey(), JSON.stringify({ profile: readForm(), template: state.template })); } catch { /* Draft storage is optional. */ }
      }
      function applyProfile(profile = blankProfile(), template = "simple", id = null) {
        const data = { ...blankProfile(), ...(profile || {}) };
        $("#portfolioTitle").value = data.title || "";
        $("#fullName").value = data.fullName || "";
        $("#email").value = data.email || "";
        $("#phone").value = data.phone || "";
        $("#address").value = data.address || "";
        $("#aboutMe").value = data.about || "";
        state.avatar = data.avatar || "";
        state.portfolioId = id;
        for (const type of Object.keys(sectionNames)) {
          $("#" + type + "List").replaceChildren();
          (Array.isArray(data[type]) ? data[type] : []).forEach(item => addRepeatRow(type, item));
        }
        state.template = ["simple", "modern", "creative"].includes(template) ? template : "simple";
        $$(".template-option").forEach(button => button.classList.toggle("selected", button.dataset.template === state.template));
        $("#avatarPreview").innerHTML = state.avatar ? '<img alt="Profile picture preview" src="' + escapeHTML(state.avatar) + '">' : escapeHTML((data.fullName || "P").slice(0, 1).toUpperCase());
        $("#deleteButton").classList.toggle("hidden", !id);
        $("#publishButton").classList.toggle("hidden", !id);
        $("#publishButton").textContent = "Publish";
        updateDraftFromForm();
        renderPreview();
      }
      function sectionHTML(title, content) {
        return content ? '<section class="pv-section"><h2>' + title + '</h2>' + content + '</section>' : "";
      }
      function listHTML(items, title, primary, secondary, detail, urlField) {
        if (!items.length) return "";
        const rows = items.map(item => {
          const first = typeof item === "string" ? item : item[primary];
          const second = typeof item === "string" ? "" : item[secondary];
          const more = typeof item === "string" ? "" : item[detail];
          const url = urlField && typeof item !== "string" ? safeUrl(item[urlField]) : "";
          return '<div class="pv-item"><strong>' + (url ? '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(first || url) + '</a>' : escapeHTML(first || "")) + '</strong>' + ((second || more) ? '<small>' + escapeHTML([second, more].filter(Boolean).join(" · ")) + '</small>' : "") + '</div>';
        }).join("");
        return sectionHTML(title, '<div class="pv-list">' + rows + '</div>');
      }
      function renderPortfolio(profile, template) {
        const name = profile.fullName || "Your name";
        const links = (profile.links || []).filter(item => item.label || item.url);
        const contacts = [profile.email, profile.phone, profile.address].filter(Boolean).map(escapeHTML).join(" &nbsp;·&nbsp; ");
        const avatar = profile.avatar ? '<img alt="" src="' + escapeHTML(profile.avatar) + '">' : escapeHTML(name.slice(0, 1).toUpperCase());
        const skillItems = (profile.skills || []).filter(Boolean);
        return '<article class="portfolio-view template-' + escapeHTML(template) + '"><div class="pv-inner"><div class="pv-kicker">Portfolio · ' + escapeHTML(profile.title || "A collection of my work") + '</div><header class="pv-hero"><div class="pv-avatar">' + avatar + '</div><div><h1>' + escapeHTML(name) + '</h1><div class="pv-subtitle">' + escapeHTML(profile.address || "A little about me") + '</div><div class="pv-contact">' + contacts + '</div></div></header>' +
          sectionHTML("About me", profile.about ? '<p>' + escapeHTML(profile.about).replace(/\n/g, "<br>") + '</p>' : "") +
          listHTML(profile.education || [], "Education", "school", "degree", "details") +
          (skillItems.length ? sectionHTML("Skills", '<div class="pv-skills">' + skillItems.map(skill => '<span class="pv-skill">' + escapeHTML(skill) + '</span>').join("") + '</div>') : "") +
          listHTML(profile.projects || [], "Selected projects", "name", "url", "description", "url") +
          listHTML(profile.experience || [], "Experience", "role", "company", "details") +
          (links.length ? sectionHTML("Find me online", '<div class="pv-list">' + links.map(item => { const url = safeUrl(item.url); const label = item.label || item.url || "Link"; return '<div class="pv-item"><strong>' + (url ? '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(label) + ' ↗</a>' : escapeHTML(label)) + '</strong></div>'; }).join("") + '</div>') : "") +
          '</div></article>';
      }
      function renderPreview() {
        const profile = readForm();
        const hasContent = profile.fullName || profile.title || profile.about || profile.education.length || profile.skills.length || profile.projects.length || profile.experience.length || profile.links.length;
        const html = hasContent ? renderPortfolio(profile, state.template) : '<div class="preview-empty">Your portfolio will come to life here.<br>Add your details to see a live preview.</div>';
        $("#previewDocument").innerHTML = html;
        $("#previewTemplateLabel").textContent = state.template.charAt(0).toUpperCase() + state.template.slice(1) + (state.portfolioId ? " · saved" : " · draft");
        $("#modalPreviewDocument").innerHTML = hasContent ? html : '<div class="preview-empty">Add some details first to preview your portfolio.</div>';
        $("#modalPreviewLabel").textContent = state.template.charAt(0).toUpperCase() + state.template.slice(1);
      }
      function formChanged() { updateDraftFromForm(); renderPreview(); }
      async function loadPortfolios() {
        if (!state.session?.user?.id) {
          $("#portfolioList").innerHTML = '<div class="empty-list">Log in to see your saved portfolios.</div>';
          return;
        }
        $("#portfolioList").innerHTML = '<div class="empty-list">Loading your portfolios…</div>';
        try {
          const rows = await request("/rest/v1/portfolios?select=id,title,template,updated_at,is_public&user_id=eq." + encodeURIComponent(state.session.user.id) + "&order=updated_at.desc");
          state.portfolios = Array.isArray(rows) ? rows : [];
          renderPortfolioList();
        } catch (error) {
          $("#portfolioList").innerHTML = '<div class="empty-list">Could not load portfolios. Check the database setup and try again.</div>';
          toast(error.message, true);
        }
      }
      function renderPortfolioList() {
        const list = $("#portfolioList");
        if (!state.portfolios.length) {
          list.innerHTML = '<div class="empty-list">No saved portfolios yet.<br>Fill in your details and save your first one.</div>';
          return;
        }
        list.innerHTML = state.portfolios.map(item => '<div class="portfolio-item"><div><strong title="' + escapeHTML(item.title || "Untitled portfolio") + '">' + escapeHTML(item.title || "Untitled portfolio") + '</strong><small>' + escapeHTML(item.template || "simple") + ' · ' + (item.is_public ? "Public" : "Private") + '</small></div><button type="button" data-load-id="' + escapeHTML(item.id) + '">Open</button></div>').join("");
        $$("[data-load-id]", list).forEach(button => button.addEventListener("click", () => loadPortfolio(button.dataset.loadId)));
      }
      async function loadPortfolio(id) {
        try {
          const rows = await request("/rest/v1/portfolios?select=id,title,template,profile,is_public&id=eq." + encodeURIComponent(id) + "&limit=1");
          if (!rows?.length) throw new Error("Portfolio not found or access was denied.");
          applyProfile(rows[0].profile, rows[0].template, rows[0].id);
          $("#publishButton").textContent = rows[0].is_public ? "Unpublish" : "Publish";
          revealBuilder();
          toast("Portfolio loaded.");
        } catch (error) { toast(error.message, true); }
      }
      function validateProfile(profile) {
        if (!profile.fullName) return "Please add your full name before saving.";
        if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return "Please enter a valid portfolio email address.";
        for (const link of [...profile.links, ...profile.projects]) {
          if (link.url && !safeUrl(link.url)) return "Links must use a valid http, https, or mailto URL.";
        }
        return "";
      }
      async function savePortfolio(event) {
        event.preventDefault();
        if (!state.config) { openModal("settingsModal"); toast("Connect a Supabase database before saving online.", true); return; }
        if (!state.session?.access_token) { showAuth("login"); toast("Log in to save your portfolio online."); return; }
        const profile = readForm();
        const issue = validateProfile(profile);
        if (issue) { toast(issue, true); return; }
        const button = $("#saveButton");
        button.disabled = true;
        button.textContent = "Saving…";
        try {
          const body = { user_id: state.session.user.id, title: profile.title || profile.fullName + "'s portfolio", template: state.template, profile };
          if (state.portfolioId) {
            await request("/rest/v1/portfolios?id=eq." + encodeURIComponent(state.portfolioId), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
          } else {
            const rows = await request("/rest/v1/portfolios", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
            if (!rows?.[0]?.id) throw new Error("The database saved the portfolio but did not return its ID.");
            state.portfolioId = rows[0].id;
            $("#publishButton").classList.remove("hidden");
            $("#deleteButton").classList.remove("hidden");
          }
          updateDraftFromForm();
          await loadPortfolios();
          renderPreview();
          toast("Portfolio saved to your cloud database.");
        } catch (error) { toast(error.message, true); }
        finally { button.disabled = false; button.textContent = "Save portfolio"; }
      }
      async function togglePublish() {
        if (!state.portfolioId) return toast("Save your portfolio before publishing.", true);
        const item = state.portfolios.find(row => row.id === state.portfolioId);
        const isPublic = !item?.is_public;
        try {
          await request("/rest/v1/portfolios?id=eq." + encodeURIComponent(state.portfolioId), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_public: isPublic }) });
          await loadPortfolios();
          $("#publishButton").textContent = isPublic ? "Unpublish" : "Publish";
          if (isPublic) {
            const shareUrl = new URL(location.href);
            shareUrl.hash = "";
            shareUrl.search = "?portfolio=" + encodeURIComponent(state.portfolioId);
            try { await navigator.clipboard.writeText(shareUrl.href); toast("Portfolio published. Share link copied to clipboard."); }
            catch { toast("Portfolio published. Its share link is " + shareUrl.href); }
          } else toast("Portfolio is private again.");
        } catch (error) { toast(error.message, true); }
      }
      async function deletePortfolio() {
        if (!state.portfolioId || !confirm("Delete this portfolio permanently? This cannot be undone.")) return;
        try {
          await request("/rest/v1/portfolios?id=eq." + encodeURIComponent(state.portfolioId), { method: "DELETE", headers: { Prefer: "return=minimal" } });
          state.portfolioId = null;
          applyProfile(blankProfile(), state.template, null);
          await loadPortfolios();
          toast("Portfolio deleted.");
        } catch (error) { toast(error.message, true); }
      }
      async function authenticate(email, password, signup) {
        if (!state.config) { closeModal("authModal"); openModal("settingsModal"); throw new Error("Connect Supabase before creating an account or logging in."); }
        if (signup) {
          const name = $("#authName").value.trim();
          const result = await request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password, data: { full_name: name } }) }, false);
          if (!result?.access_token) {
            closeModal("authModal");
            toast("Account created. Check your email to confirm your address, then log in.");
            return;
          }
          state.session = result;
        } else {
          const result = await request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }, false);
          if (!result?.access_token) throw new Error("Login did not return a session. Check your email and password.");
          state.session = result;
        }
        if (state.session.expires_in) state.session.expires_at = Math.floor(Date.now() / 1000) + state.session.expires_in;
        localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
        setAuthUI();
        closeModal("authModal");
        await loadPortfolios();
        revealBuilder();
        toast(signup ? "Your account is ready." : "You’re logged in.");
      }
      async function signOut() {
        let logoutError = null;
        try {
          if (state.config && state.session?.access_token) await request("/auth/v1/logout", { method: "POST" });
        } catch (error) { logoutError = error; }
        state.session = null;
        localStorage.removeItem(SESSION_KEY);
        state.portfolios = [];
        applyProfile(blankProfile(), "simple", null);
        setAuthUI();
        renderPortfolioList();
        toast(logoutError ? "Logged out on this device, but the cloud session could not be closed: " + logoutError.message : "You’ve logged out.", Boolean(logoutError));
      }
      async function connectSupabase(event) {
        event.preventDefault();
        const url = $("#supabaseUrl").value.trim().replace(/\/+$/, "");
        const key = $("#supabaseKey").value.trim();
        let parsed;
        try { parsed = new URL(url); } catch { toast("Enter a valid Supabase project URL.", true); return; }
        if (!(parsed.protocol === "https:" || parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
          toast("Use a secure Supabase project URL (https://your-project.supabase.co).", true); return;
        }
        const button = $("#connectButton");
        button.disabled = true;
        button.textContent = "Checking connection…";
        try {
          const response = await fetch(url + "/auth/v1/health", { headers: { apikey: key, Authorization: "Bearer " + key } });
          if (!response.ok) throw new Error("Supabase returned " + response.status + ". Check the project URL and public key.");
          state.config = { url, key };
          state.session = null;
          localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
          localStorage.removeItem(SESSION_KEY);
          setAuthUI();
          closeModal("settingsModal");
          toast("Supabase connected. Log in or create your Portech account.");
          showAuth("signup");
        } catch (error) { toast(error.message || "Could not connect to Supabase.", true); }
        finally { button.disabled = false; button.textContent = "Test and connect"; }
      }
      async function resizeImage(file) {
        if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
        const image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Could not read this image.")); img.src = reader.result; };
          reader.onerror = () => reject(new Error("Could not read this image."));
          reader.readAsDataURL(file);
        });
        const max = 500;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", .82);
      }
      function renderPublicPortfolio(profile, template) {
        $("#site").classList.add("hidden");
        document.body.insertAdjacentHTML("beforeend", '<main class="public-page"><div class="public-top"><a class="brand" href="./"><span class="brand-mark">p.</span>Portech</a><span>Portfolio</span></div><div class="preview-document" id="publicDocument"><div class="preview-empty">Loading portfolio…</div></div></main>');
        $("#publicDocument").innerHTML = renderPortfolio(profile, template);
      }
      async function loadPublicPortfolio(id) {
        $("#site").classList.add("hidden");
        document.body.insertAdjacentHTML("beforeend", '<main class="public-page"><div class="public-top"><a class="brand" href="./"><span class="brand-mark">p.</span>Portech</a><span>Portfolio</span></div><div class="preview-document" id="publicDocument"><div class="preview-empty">Loading portfolio…</div></div></main>');
        try {
          const rows = await request("/rest/v1/portfolios?select=profile,template&id=eq." + encodeURIComponent(id) + "&is_public=eq.true&limit=1", {}, false);
          if (!rows?.length) throw new Error("This portfolio is private, unavailable, or does not exist.");
          $("#publicDocument").innerHTML = renderPortfolio(rows[0].profile, rows[0].template);
        } catch (error) {
          $("#publicDocument").innerHTML = '<div class="preview-empty">' + escapeHTML(error.message) + '<br><a href="./">Create your own portfolio</a></div>';
        }
      }
      function restoreDraft() {
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey()) || "null");
          if (draft?.profile) applyProfile(draft.profile, draft.template || "simple", null);
          else applyProfile(blankProfile());
        } catch { applyProfile(blankProfile()); }
      }

      $("#loginButton").addEventListener("click", () => state.session?.access_token ? revealBuilder() : showAuth("login"));
      $("#signupButton").addEventListener("click", () => state.session?.access_token ? (restoreDraft(), state.portfolioId = null, revealBuilder()) : showAuth("signup"));
      $$('a[href="#builder"]').forEach(link => link.addEventListener("click", event => {
        event.preventDefault();
        if (state.session?.access_token) revealBuilder();
        else showAuth("signup");
      }));
      $("#authDatabaseButton").addEventListener("click", () => { closeModal("authModal"); openModal("settingsModal"); });
      $("#settingsButton").addEventListener("click", () => {
        if (state.config) { $("#supabaseUrl").value = state.config.url; $("#supabaseKey").value = state.config.key; }
        openModal("settingsModal");
      });
      $("#logoutButton").addEventListener("click", signOut);
      $("#portfolioForm").addEventListener("submit", savePortfolio);
      $("#previewButton").addEventListener("click", () => { renderPreview(); openModal("previewModal"); });
      $("#publishButton").addEventListener("click", togglePublish);
      $("#deleteButton").addEventListener("click", deletePortfolio);
      $("#newPortfolioButton").addEventListener("click", () => { applyProfile(blankProfile(), state.template, null); toast("New portfolio draft started."); });
      $("#templatePicker").addEventListener("click", event => {
        const button = event.target.closest("[data-template]");
        if (!button) return;
        state.template = button.dataset.template;
        $$(".template-option").forEach(option => option.classList.toggle("selected", option === button));
        formChanged();
      });
      $$(".add-row").forEach(button => button.addEventListener("click", () => { addRepeatRow(button.dataset.add); formChanged(); }));
      $("#portfolioForm").addEventListener("input", event => {
        if (event.target.id !== "profilePicture") formChanged();
        if (event.target.id === "fullName" && !state.avatar) $("#avatarPreview").textContent = event.target.value.trim().slice(0, 1).toUpperCase() || "P";
      });
      $("#profilePicture").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          state.avatar = await resizeImage(file);
          $("#avatarPreview").innerHTML = '<img alt="Profile picture preview" src="' + escapeHTML(state.avatar) + '">';
          formChanged();
        } catch (error) { toast(error.message, true); event.target.value = ""; }
      });
      $("#authForm").addEventListener("submit", async event => {
        event.preventDefault();
        const button = $("#authSubmit");
        button.disabled = true;
        try { await authenticate($("#authEmail").value.trim(), $("#authPassword").value, state.authMode === "signup"); }
        catch (error) { toast(error.message, true); }
        finally { button.disabled = false; }
      });
      $("#settingsForm").addEventListener("submit", connectSupabase);
      $$("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
      $$(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => { if (event.target === backdrop) closeModal(backdrop.id); }));
      window.addEventListener("keydown", event => { if (event.key === "Escape") $$(".modal-backdrop").forEach(modal => closeModal(modal.id)); });
      window.addEventListener("beforeunload", updateDraftFromForm);

      loadSavedConfig();
      if (state.config && new URLSearchParams(location.search).has("portfolio")) {
        loadPublicPortfolio(new URLSearchParams(location.search).get("portfolio"));
      } else {
        restoreDraft();
        if (state.session?.access_token) {
          setAuthUI();
          loadPortfolios();
        }
      }
    })();
