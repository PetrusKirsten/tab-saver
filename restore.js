function setStatus(message) {
  document.getElementById("status").textContent =
    message;
}

// ==========
// TXT
// ==========

function parseTXT(content) {
  const blocks = content
    .trim()
    .split(/\n\s*\n/);

  return blocks
    .map((block, index) => {

      const lines = block
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        return null;
      }

      const title = lines[0]
        .replace(/^\d+\.\s*/, "");

      const url = lines[1];

      return {
        title,
        url,
        windowId: null,
        index,
        pinned: false,
        active: false,
        groupId: -1
      };

    })

    .filter(tab =>
      tab && tab.url
    );
}

// =============
// JSON
// =============

function parseJSON(content) {
  const data = JSON.parse(content);

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.tabs)) {
    return data.tabs;
  }

  throw new Error(
    "JSON não contém uma lista de abas."
  );
}

// =============
// CSV
// =============

function parseCSVLine(line) {
  const result = [];

  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {

    const char = line[i];

    if (char === '"') {

      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {

        value += '"';
        i++;

      } else {

        insideQuotes =
          !insideQuotes;

      }

    } else if (
      char === "," &&
      !insideQuotes
    ) {

      result.push(value);

      value = "";

    } else {

      value += char;

    }
  }

  result.push(value);

  return result;
}

function parseCSV(content) {
  content =
    content.replace(/^\uFEFF/, "");

  const lines = content
    .trim()
    .split(/\r?\n/);

  const headers =
    parseCSVLine(lines[0]);

  return lines.slice(1).map(line => {

    const values =
      parseCSVLine(line);

    const row = {};

    headers.forEach(
      (header, index) => {

        row[header] =
          values[index];

      }
    );

    return {
      title: row.title || "",
      url: row.url || "",

      windowId:
        row.windowId
          ? Number(row.windowId)
          : null,

      index:
        Number(row.index) || 0,

      pinned:
        row.pinned === "true",

      active:
        row.active === "true",

      groupId:
        Number(row.groupId) || -1
    };

  });
}

// ==================
// Leitor universal
// ==================

async function readBackupFile(file) {

  const content =
    await file.text();

  const extension =
    file.name
      .split(".")
      .pop()
      .toLowerCase();

  switch (extension) {

    case "txt":
      return parseTXT(content);

    case "csv":
      return parseCSV(content);

    case "json":
      return parseJSON(content);

    default:
      throw new Error(
        `Formato não suportado: .${extension}`
      );
  }
}

// ==================
// URLs para ignorar
// ==================

function shouldIgnoreUrl(url) {

  if (!url) {
    return true;
  }

  if (url.startsWith("chrome://")) {
    return true;
  }

  try {

    const parsed =
      new URL(url);

    if (
      parsed.hostname ===
      "web.whatsapp.com"
    ) {
      return true;
    }

  } catch {
    return true;
  }

  return false;
}

// =================
// Restaurar abas
// =================

async function restoreTabs(

  tabs,
  incognito = false
) {

  const validTabs =
    tabs.filter(
      tab =>
        !shouldIgnoreUrl(tab.url)
    );

  if (
    validTabs.length === 0
  ) {

    throw new Error(
      "Nenhuma URL válida encontrada."
    );

  }

  const firstTab =
    validTabs[0];

  const newWindow =
    await chrome.windows.create({

      url: firstTab.url,

      incognito

    });

  const windowId =
    newWindow.id;

  for (
    let i = 1;
    i < validTabs.length;
    i++
  ) {

    const tab =
      validTabs[i];

    try {

      await chrome.tabs.create({

        windowId,

        url: tab.url,

        active: false,

        pinned:
          tab.pinned || false

      });

    } catch (error) {

      console.error(
        `Não foi possível restaurar: ${tab.url}`,
        error
      );

    }

  }

  return validTabs.length;
}

document
  .getElementById("restore")
  .addEventListener(
    "click",
    async () => {

      const input =
        document.getElementById(
          "backupFile"
        );

      const file =
        input.files[0];

      if (!file) {

        setStatus(
          "Selecione um arquivo."
        );

        return;

      }

      try {

        setStatus(
          "Lendo backup..."
        );

        const tabs =
          await readBackupFile(
            file
          );

        console.log(
          "Abas encontradas:",
          tabs
        );

        const incognito =
          document
            .getElementById(
              "incognito"
            )
            .checked;

        const restored =
          await restoreTabs(
            tabs,
            incognito
          );

        setStatus(
          `${restored} abas restauradas.`
        );

      } catch (error) {

        console.error(error);

        setStatus(
          `Erro: ${error.message}`
        );

      }

    }
  );