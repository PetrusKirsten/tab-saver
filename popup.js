const DEFAULT_IGNORE_HOSTS = [
  "web.whatsapp.com"
];


// ========================================
// Captura de abas
// ========================================

async function getTabs(scope = "current") {
  const query =
    scope === "current"
      ? { currentWindow: true }
      : {};

  const tabs = await chrome.tabs.query(query);

  return tabs.map((tab) => ({
    tabId: tab.id ?? null,
    windowId: tab.windowId ?? null,
    index: tab.index ?? null,
    title: tab.title || "",
    url: tab.url || "",
    pinned: tab.pinned ?? false,
    active: tab.active ?? false,
    groupId: tab.groupId ?? -1
  }));
}


function getSelectedScope() {
  const selected = document.querySelector(
    'input[name="scope"]:checked'
  );

  return selected?.value || "current";
}


// ========================================
// Ignore list
// ========================================

async function getIgnoreHosts() {
  const result =
    await chrome.storage.local.get(
      "ignoreHosts"
    );

  // Primeira execução da extensão.
  if (!Array.isArray(result.ignoreHosts)) {
    await chrome.storage.local.set({
      ignoreHosts: DEFAULT_IGNORE_HOSTS
    });

    return [...DEFAULT_IGNORE_HOSTS];
  }

  return result.ignoreHosts;
}


function shouldIgnoreUrl(
  url,
  ignoreHosts
) {
  if (!url) {
    return true;
  }

  // Páginas internas do Chrome não devem entrar
  // nos backups/restaurações.
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://")
  ) {
    return true;
  }

  try {
    const parsed = new URL(url);

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

        // Ignora o domínio e seus subdomínios.
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


async function filterIgnoredTabs(tabs) {
  // Lemos o storage uma única vez.
  const ignoreHosts =
    await getIgnoreHosts();

  const filtered =
    tabs.filter(
      (tab) =>
        !shouldIgnoreUrl(
          tab.url,
          ignoreHosts
        )
    );

  // Renumera somente depois da filtragem.
  return filtered.map(
    (tab, index) => ({
      ...tab,
      exportIndex: index + 1
    })
  );
}


// ========================================
// Utilidades
// ========================================

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
}


function setStatus(message) {
  document
    .getElementById("status")
    .textContent = message;
}


async function downloadData(
  content,
  filename,
  mimeType
) {
  const dataUrl =
    `data:${mimeType};charset=utf-8,` +
    encodeURIComponent(content);

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true
  });
}


function escapeCSV(value) {
  const sanitized =
    String(value ?? "")
      .replace(/\r?\n/g, " ")
      .replace(/"/g, '""');

  return `"${sanitized}"`;
}


/*
 * Executa o fluxo comum às três exportações:
 *
 * scope
 *   ↓
 * captura
 *   ↓
 * ignore-list
 *   ↓
 * dados prontos para exportação
 */
async function prepareExport() {
  const scope =
    getSelectedScope();

  const capturedTabs =
    await getTabs(scope);

  const tabs =
    await filterIgnoredTabs(
      capturedTabs
    );

  return {
    scope,
    capturedTabs,
    tabs
  };
}


function showExportStatus(
  format,
  capturedTabs,
  tabs
) {
  const ignored =
    capturedTabs.length -
    tabs.length;

  let message =
    `${tabs.length} abas exportadas em ${format}.`;

  if (ignored > 0) {
    message +=
      ` ${ignored} ignorada(s).`;
  }

  setStatus(message);
}


// ========================================
// TXT
// ========================================

document
  .getElementById("txt")
  .addEventListener(
    "click",
    async () => {
      try {
        const {
          capturedTabs,
          tabs
        } =
          await prepareExport();

        const content = tabs
          .map((tab) => [
            `${tab.exportIndex}. ${tab.title}`,
            tab.url,
            `windowId: ${tab.windowId}`,
            `index: ${tab.index}`,
            `pinned: ${tab.pinned}`,
            `active: ${tab.active}`,
            `groupId: ${tab.groupId}`
          ].join("\n"))
          .join("\n\n");

        await downloadData(
          content,
          `tab-saver-${timestamp()}.txt`,
          "text/plain"
        );

        showExportStatus(
          "TXT",
          capturedTabs,
          tabs
        );

      } catch (error) {
        console.error(
          "Erro ao exportar TXT:",
          error
        );

        setStatus(
          "Erro ao exportar TXT."
        );
      }
    }
  );


// ========================================
// CSV
// ========================================

document
  .getElementById("csv")
  .addEventListener(
    "click",
    async () => {
      try {
        const {
          capturedTabs,
          tabs
        } =
          await prepareExport();

        const rows = [
          [
            "exportIndex",
            "tabId",
            "windowId",
            "index",
            "title",
            "url",
            "pinned",
            "active",
            "groupId"
          ],

          ...tabs.map((tab) => [
            tab.exportIndex,
            tab.tabId,
            tab.windowId,
            tab.index,
            tab.title,
            tab.url,
            tab.pinned,
            tab.active,
            tab.groupId
          ])
        ];

        const content =
          "\ufeff" +
          rows
            .map(
              (row) =>
                row
                  .map(escapeCSV)
                  .join(",")
            )
            .join("\n");

        await downloadData(
          content,
          `tab-saver-${timestamp()}.csv`,
          "text/csv"
        );

        showExportStatus(
          "CSV",
          capturedTabs,
          tabs
        );

      } catch (error) {
        console.error(
          "Erro ao exportar CSV:",
          error
        );

        setStatus(
          "Erro ao exportar CSV."
        );
      }
    }
  );


// ========================================
// JSON
// ========================================

document
  .getElementById("json")
  .addEventListener(
    "click",
    async () => {
      try {
        const {
          scope,
          capturedTabs,
          tabs
        } =
          await prepareExport();

        const backup = {
          // Versão do formato do backup.
          // É diferente da versão da extensão.
          formatVersion: 1,

          appVersion:
            chrome.runtime
              .getManifest()
              .version,

          exportedAt:
            new Date()
              .toISOString(),

          scope,

          tabCount:
            tabs.length,

          windowCount:
            new Set(
              tabs.map(
                (tab) =>
                  tab.windowId
              )
            ).size,

          tabs
        };

        const content =
          JSON.stringify(
            backup,
            null,
            2
          );

        await downloadData(
          content,
          `tab-saver-${timestamp()}.json`,
          "application/json"
        );

        showExportStatus(
          "JSON",
          capturedTabs,
          tabs
        );

      } catch (error) {
        console.error(
          "Erro ao exportar JSON:",
          error
        );

        setStatus(
          "Erro ao exportar JSON."
        );
      }
    }
  );


// ========================================
// Página de restauração
// ========================================

document
  .getElementById("openRestore")
  .addEventListener(
    "click",
    () => {
      chrome.tabs.create({
        url:
          chrome.runtime.getURL(
            "restore.html"
          )
      });
    }
  );