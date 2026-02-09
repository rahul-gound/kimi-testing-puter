let editor;
let activeFile = "index.html";

const files = {
  "index.html": `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Demo</title>
</head>
<body>
  <div class="wrap">
    <h1>Welcome ✨</h1>
    <p>Edit code, then hit Run or switch to Preview.</p>
    <button class="btn">Click me</button>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
  "style.css": `body{margin:0;font-family:system-ui;background:#0b1020;color:#e5e7eb}
.wrap{max-width:760px;margin:56px auto;padding:24px}
.btn{padding:10px 14px;border:0;border-radius:10px;background:#6366f1;color:white;cursor:pointer}`,
  "app.js": `document.querySelector(".btn")?.addEventListener("click", ()=> alert("Hello from preview!"));`
};

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);

function setStatus(text){
  $("statusPill").textContent = text;
}

function addMsg(who, text, kind){
  const div = document.createElement("div");
  div.className = `msg ${kind || ""}`.trim();
  div.innerHTML = `<div class="who">${who}</div><div class="txt"></div>`;
  div.querySelector(".txt").textContent = text;
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return div;
}

function showPanel(which){
  const isEditor = which === "editor";
  $("editorWrap").classList.toggle("show", isEditor);
  $("previewWrap").classList.toggle("show", !isEditor);

  $("tabEditor").classList.toggle("active", isEditor);
  $("tabPreview").classList.toggle("active", !isEditor);

  $("tabEditor").setAttribute("aria-selected", String(isEditor));
  $("tabPreview").setAttribute("aria-selected", String(!isEditor));

  // Monaco sometimes needs a layout refresh after hiding/showing
  if (isEditor && editor) setTimeout(() => editor.layout(), 50);
}

function setActiveFile(name){
  // Save current editor content into the previously active file
  if (editor) files[activeFile] = editor.getValue();

  activeFile = name;

  // Update file tab UI
  document.querySelectorAll(".filetab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.file === name);
  });

  // Swap Monaco language and content
  if (editor){
    const lang = name.endsWith(".css") ? "css" : name.endsWith(".js") ? "javascript" : "html";
    const model = monaco.editor.createModel(files[name] || "", lang);
    editor.setModel(model);
  }
}

// ---------- Preview ----------
function updatePreview(){
  // Make sure editor changes are saved
  if (editor) files[activeFile] = editor.getValue();

  const iframe = $("preview");
  iframe.srcdoc = `
    ${files["index.html"] || ""}
    <style>${files["style.css"] || ""}</style>
    <script>${files["app.js"] || ""}<\/script>
  `;
}

// Ctrl+Enter to Run
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){
    e.preventDefault();
    updatePreview();
    showPanel("preview");
  }
});

// ---------- Puter login ----------
$("loginBtn").onclick = async () => {
  try{
    await puter.auth.signIn();
    setStatus("Logged in ✅");
  }catch{
    setStatus'statusPill'
    setStatus("Login cancelled");
  }
};

// ---------- Tabs ----------
$("tabEditor").onclick = () => showPanel("editor");
$("tabPreview").onclick = () => { updatePreview(); showPanel("preview"); };

$("runBtn").onclick = () => { updatePreview(); showPanel("preview"); };

document.querySelectorAll(".filetab").forEach(btn => {
  btn.addEventListener("click", () => setActiveFile(btn.dataset.file));
});

// ---------- Monaco load ----------
require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create($("editor"), {
    value: files[activeFile],
    language: "html",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13
  });

  // Update preview when switching to preview tab or pressing Run
  showPanel("editor");
  updatePreview();
});

// ---------- AI send ----------
$("send").onclick = async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt) return;
  $("prompt").value = "";

  addMsg("You", prompt, "you");

  // Save editor content before sending context
  if (editor) files[activeFile] = editor.getValue();

  const thinking = addMsg("Claude", "Thinking…", "ai");

  try{
    // IMPORTANT: Puter requires login popup for Claude.
    // We send all files (good for quality). For speed, you can send only active file later.
    const result = await puter.ai.chat({
      // If Puter exposes a specific Claude 4.5 ID in your account, swap it here.
      // Many environments use a "claude-sonnet" style string. Keep this default if unsure.
      model: "claude-3.5-sonnet",
      messages: [
        {
          role: "system",
          content:
`You are an expert frontend engineer and UI designer.
You will update a small multi-file web project.

Return ONLY in this exact format:

FILE:index.html
<full file>

FILE:style.css
<full file>

FILE:app.js
<full file>

Do not include markdown fences. Do not add commentary.`
        },
        {
          role: "user",
          content:
`CURRENT FILES:
--- index.html ---
${files["index.html"]}

--- style.css ---
${files["style.css"]}

--- app.js ---
${files["app.js"]}

REQUEST:
${prompt}`
        }
      ]
    });

    const text = (result?.message?.content ?? "").toString();
    const updated = parseFiles(text);

    if (updated){
      // Refresh editor model content for active file
      if (editor) editor.setValue(files[activeFile] || "");
      updatePreview();
      thinking.querySelector(".txt").textContent = "✅ Updated. Open Preview tab.";
    }else{
      thinking.querySelector(".txt").textContent = "I couldn't parse the files. Try again with simpler request.";
    }
  }catch(err){
    thinking.querySelector(".txt").textContent = "Error calling model. Make sure you logged in with Puter.";
  }
};

function parseFiles(text){
  // Expect: FILE:name\n...content...
  const blocks = text.split("\nFILE:");
  let changed = false;

  // First block might start with FILE:
  const first = blocks[0].startsWith("FILE:") ? [text] : blocks;

  const parts = (first === blocks) ? blocks : [text];

  // Normalize
  const all = text.startsWith("FILE:") ? text.split("\nFILE:") : ["", ...blocks];

  for (let i=0; i<all.length; i++){
    const chunk = all[i];
    if (!chunk.trim()) continue;

    const header = chunk.startsWith("FILE:") ? chunk.slice(5) : chunk;
    const name = header.split("\n")[0]?.trim();
    if (!name || !(name in files)) continue;

    const content = header.slice(name.length).trimStart();
    if (typeof content === "string" && content.length){
      files[name] = content.trimEnd();
      changed = true;
    }
  }
  return changed;
}
