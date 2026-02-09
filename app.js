let editor;
let files = {
  "index.html": "<h1>Hello World</h1>",
  "style.css": "body { font-family: sans-serif; }",
  "app.js": "console.log('Hello');"
};

document.getElementById("loginBtn").onclick = async () => {
  await puter.auth.signIn();
};

require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: files["index.html"],
    language: "html",
    theme: "vs-dark",
    automaticLayout: true
  });
  updatePreview();
});

function updatePreview() {
  const iframe = document.getElementById("preview");
  iframe.srcdoc = `
    <style>${files["style.css"]}</style>
    ${files["index.html"]}
    <script>${files["app.js"]}<\/script>
  `;
}

document.getElementById("send").onclick = async () => {
  const prompt = document.getElementById("prompt").value;
  document.getElementById("prompt").value = "";

  addMsg("You", prompt);

  const response = await puter.ai.chat({
    model: "claude-3.5-sonnet",
    messages: [
      {
        role: "system",
        content: `You are an expert web developer.
Return updated files in this format:

FILE:index.html
<code>

FILE:style.css
<code>

FILE:app.js
<code>`
      },
      {
        role: "user",
        content: `
CURRENT FILES:
${Object.entries(files).map(([k,v])=>`--- ${k} ---\n${v}`).join("\n")}

REQUEST:
${prompt}
`
      }
    ]
  });

  const text = response.message.content;
  parseFiles(text);
  updatePreview();
  addMsg("Claude", "✅ Updated project");
};

function parseFiles(text) {
  const parts = text.split("FILE:");
  parts.forEach(p => {
    const name = p.split("\n")[0]?.trim();
    if (files[name]) {
      files[name] = p.slice(name.length).trim();
    }
  });
  editor.setValue(files["index.html"]);
}

function addMsg(author, msg) {
  const div = document.createElement("div");
  div.textContent = `${author}: ${msg}`;
  document.getElementById("messages").appendChild(div);
}
