const DEFAULT_IGNORE_HOSTS = [
  "web.whatsapp.com"
];


// ========================================
// Utilidades gerais
// ========================================

function setStatus(message) {
  document
    .getElementById("status")
    .textContent = message;
}


function parseNumber(
  value,
  fallback = null
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function parseBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined) {
    return fallback;
  }

  return (
    String(value)
      .toLowerCase() === "true"
  );
}


// ========================================
// Ignore list
// ========================================

async function getIgnoreHosts() {
  const result =
    await chrome.storage.local.get(
      "ignoreHosts"
    );

  if (!Array.isArray(result.ignoreHosts)) {
    await chrome.storage.local.set({
      ignoreHosts:
        DEFAULT_IGNORE_HOSTS
    });

    return [
      ...DEFAULT_IGNORE_HOSTS
    ];
  }

  return result.ignoreHosts;
}


async function saveIgnoreHosts(hosts) {
  await chrome.storage.local.set({
    ignoreHosts: hosts
  });
}


function normalizeHost(value) {
  let input =
    value
      .trim()
      .toLowerCase();

  if (!input) {
    return null;
  }

  try {
    if (!input.includes("://")) {
      input =
        `https://${input}`;
    }

    const url =
      new URL(input);

    return url.hostname
      .replace(/^www\./, "");

  } catch {
    return null;
  }
}


function shouldIgnoreUrl(
  url,
  ignoreHosts
) {
  if (!url) {
    return true;
  }

  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://")
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(url);

    const hostname =
      parsed.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    return ignoreHosts.some(
      (ignoreHost) => {
        const normalized =
          ignoreHost
            .toLowerCase()
            .replace(/^www\./, "");

        return (
          hostname === normalized ||
          hostname.endsWith(
            `.${normalized}`
          )
        );
      }
    );

  } catch {
    return true;
  }
}


async function renderIgnoreList() {
  const list =
    document.getElementById(
      "ignoreList"
    );

  const hosts =
    await getIgnoreHosts();

  list.innerHTML = "";

  for (const host of hosts) {
    const item =
      document.createElement("li");

    const text =
      document.createElement("span");

    text.textContent = host;

    const button =
      document.createElement(
        "button"
      );

    button.textContent =
      "Remover";

    button.addEventListener(
      "click",
      async () => {
        const current =
          await getIgnoreHosts();

        const updated =
          current.filter(
            (item) =>
              item !== host
          );

        await saveIgnoreHosts(
          updated
        );

        await renderIgnoreList();

        setStatus(
          `${host} removido da lista.`
        );
      }
    );

    item.appendChild(text);

    item.appendChild(
      document.createTextNode(" ")
    );

    item.appendChild(button);

    list.appendChild(item);
  }
}


async function addIgnoreHost() {
  const input =
    document.getElementById(
      "ignoreInput"
    );

  const host =
    normalizeHost(
      input.value
    );

  if (!host) {
    setStatus(
      "Digite um domínio válido."
    );

    return;
  }

  const hosts =
    await getIgnoreHosts();

  if (hosts.includes(host)) {
    setStatus(
      `${host} já está na lista.`
    );

    return;
  }

  hosts.push(host);
  hosts.sort();

  await saveIgnoreHosts(
    hosts
  );

  input.value = "";

  await renderIgnoreList();

  setStatus(
    `${host} adicionado à lista.`
  );
}


// ========================================
// Normalização de abas importadas
// ========================================

function normalizeTab(
  tab,
  fallbackIndex = 0
) {
  return {
    title:
      String(
        tab?.title ?? ""
      ),

    url:
      String(
        tab?.url ?? ""
      ),

    windowId:
      parseNumber(
        tab?.windowId,
        null
      ),

    index:
      parseNumber(
        tab?.index,
        fallbackIndex
      ),

    pinned:
      parseBoolean(
        tab?.pinned
      ),

    active:
      parseBoolean(
        tab?.active
      ),

    groupId:
      parseNumber(
        tab?.groupId,
        -1
      )
  };
}


// ========================================
// TXT
// ========================================

function parseTXT(content) {
  const blocks =
    content
      .trim()
      .split(/\n\s*\n/);

  return blocks
    .map(
      (block, fallbackIndex) => {
        const lines =
          block
            .split(/\r?\n/)
            .map(
              (line) =>
                line.trim()
            )
            .filter(Boolean);

        if (lines.length < 2) {
          return null;
        }

        const title =
          lines[0]
            .replace(
              /^\d+\.\s*/,
              ""
            );

        const url =
          lines[1];

        const metadata = {};

        /*
         * Permite ler tanto:
         *
         * TXT antigo:
         *   título
         *   URL
         *
         * quanto TXT novo:
         *   título
         *   URL
         *   windowId: ...
         *   index: ...
         *   pinned: ...
         *   active: ...
         *   groupId: ...
         */
        for (
          const line
          of lines.slice(2)
        ) {
          const separator =
            line.indexOf(":");

          if (separator === -1) {
            continue;
          }

          const key =
            line
              .slice(
                0,
                separator
              )
              .trim();

          const value =
            line
              .slice(
                separator + 1
              )
              .trim();

          metadata[key] =
            value;
        }

        return normalizeTab(
          {
            title,
            url,

            windowId:
              metadata.windowId,

            index:
              metadata.index,

            pinned:
              metadata.pinned,

            active:
              metadata.active,

            groupId:
              metadata.groupId
          },

          fallbackIndex
        );
      }
    )
    .filter(
      (tab) =>
        tab &&
        tab.url
    );
}


// ========================================
// JSON
// ========================================

function parseJSON(content) {
  const data =
    JSON.parse(content);

  const tabs =
    Array.isArray(data)
      ? data
      : data.tabs;

  if (!Array.isArray(tabs)) {
    throw new Error(
      "JSON não contém uma lista de abas."
    );
  }

  return tabs.map(
    (tab, index) =>
      normalizeTab(
        tab,
        index
      )
  );
}


// ========================================
// CSV
// ========================================

function parseCSVLine(line) {
  const result = [];

  let value = "";
  let insideQuotes = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i];

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
  const cleanContent =
    content.replace(
      /^\uFEFF/,
      ""
    );

  const lines =
    cleanContent
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers =
    parseCSVLine(
      lines[0]
    );

  return lines
    .slice(1)
    .map(
      (line, index) => {
        const values =
          parseCSVLine(line);

        const row = {};

        headers.forEach(
          (header, column) => {
            row[header] =
              values[column];
          }
        );

        return normalizeTab(
          row,
          index
        );
      }
    )
    .filter(
      (tab) =>
        tab.url
    );
}


// ========================================
// Leitor universal
// ========================================

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


// ========================================
// Restauração
// ========================================

async function restoreSingleWindow(
  tabs,
  incognito = false
) {
  const sortedTabs =
    [...tabs].sort(
      (a, b) =>
        a.index -
        b.index
    );

  if (
    sortedTabs.length === 0
  ) {
    return 0;
  }

  const firstTabData =
    sortedTabs[0];

  const newWindow =
    await chrome.windows.create({
      url:
        firstTabData.url,

      incognito
    });

  const newWindowId =
    newWindow.id;

  const createdTabs = [];

  // windows.create() já cria a primeira aba.
  const firstCreatedTab =
    newWindow.tabs?.[0];

  if (firstCreatedTab) {
    createdTabs.push({
      original:
        firstTabData,

      created:
        firstCreatedTab
    });
  }


  // Demais abas.
  for (
    let i = 1;
    i < sortedTabs.length;
    i++
  ) {
    const originalTab =
      sortedTabs[i];

    try {
      const createdTab =
        await chrome.tabs.create({
          windowId:
            newWindowId,

          url:
            originalTab.url,

          active: false
        });

      createdTabs.push({
        original:
          originalTab,

        created:
          createdTab
      });

    } catch (error) {
      console.error(
        `Não foi possível restaurar: ${originalTab.url}`,
        error
      );
    }
  }


  // Restaura abas fixadas.
  for (
    const item
    of createdTabs
  ) {
    if (
      !item.original.pinned
    ) {
      continue;
    }

    try {
      await chrome.tabs.update(
        item.created.id,
        {
          pinned: true
        }
      );

    } catch (error) {
      console.error(
        "Erro ao fixar aba:",
        item.original.url,
        error
      );
    }
  }


  // Restaura a aba ativa original.
  const activeItem =
    createdTabs.find(
      (item) =>
        item.original.active
    );

  if (activeItem) {
    try {
      await chrome.tabs.update(
        activeItem.created.id,
        {
          active: true
        }
      );

    } catch (error) {
      console.error(
        "Erro ao ativar aba:",
        error
      );
    }
  }

  return createdTabs.length;
}


async function restoreTabs(
  tabs,
  incognito = false
) {
  // Carregamos a configuração apenas uma vez.
  const ignoreHosts =
    await getIgnoreHosts();

  const validTabs =
    tabs.filter(
      (tab) =>
        !shouldIgnoreUrl(
          tab.url,
          ignoreHosts
        )
    );

  if (
    validTabs.length === 0
  ) {
    throw new Error(
      "Nenhuma URL válida encontrada."
    );
  }


  /*
   * Backups TXT antigos não possuem windowId.
   * Nesse caso, todas as abas são restauradas
   * em uma única janela.
   */
  const hasWindowInfo =
    validTabs.some(
      (tab) =>
        tab.windowId !== null &&
        tab.windowId !== undefined
    );

  if (!hasWindowInfo) {
    return restoreSingleWindow(
      validTabs,
      incognito
    );
  }


  /*
   * windowId antigo não é reutilizado.
   *
   * Ele serve apenas para identificar quais
   * abas pertenciam à mesma janela.
   */
  const windowsMap =
    new Map();

  for (
    const tab
    of validTabs
  ) {
    const originalWindowId =
      tab.windowId;

    if (
      !windowsMap.has(
        originalWindowId
      )
    ) {
      windowsMap.set(
        originalWindowId,
        []
      );
    }

    windowsMap
      .get(originalWindowId)
      .push(tab);
  }


  let restoredCount = 0;

  for (
    const windowTabs
    of windowsMap.values()
  ) {
    restoredCount +=
      await restoreSingleWindow(
        windowTabs,
        incognito
      );
  }

  return restoredCount;
}


// ========================================
// Eventos da interface
// ========================================

document
  .getElementById("addIgnore")
  .addEventListener(
    "click",
    addIgnoreHost
  );


// Enter também adiciona domínio.
document
  .getElementById("ignoreInput")
  .addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        addIgnoreHost();
      }
    }
  );


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
        console.error(
          "Erro ao restaurar:",
          error
        );

        setStatus(
          `Erro: ${error.message}`
        );
      }
    }
  );


// Inicializa a interface.
renderIgnoreList();