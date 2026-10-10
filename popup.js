async function getTabs() {
  const tabs = await chrome.tabs.query({});

  return tabs.map((tab, index) => ({
    exportIndex: index + 1,
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

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

async function downloadData(content, filename, mimeType) {
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
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}


// =========================
// TXT
// =========================

document.getElementById("txt").addEventListener("click", async () => {
  try {
    const tabs = await getTabs();

    const content = tabs
      .map((tab) => {
        return [
          `${tab.exportIndex}. ${tab.title}`,
          tab.url,
          `windowId: ${tab.windowId}`,
          `index: ${tab.index}`,
          `pinned: ${tab.pinned}`,
          `groupId: ${tab.groupId}`
        ].join("\n");
      })
      .join("\n\n");

    await downloadData(
      content,
      `chrome-tabs-${timestamp()}.txt`,
      "text/plain"
    );

    setStatus(`${tabs.length} abas exportadas em TXT.`);
  } catch (error) {
    console.error("Erro ao exportar TXT:", error);
    setStatus("Erro ao exportar TXT.");
  }
});


// =========================
// CSV
// =========================

document.getElementById("csv").addEventListener("click", async () => {
  try {
    const tabs = await getTabs();

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
        .map((row) => row.map(escapeCSV).join(","))
        .join("\n");

    await downloadData(
      content,
      `chrome-tabs-${timestamp()}.csv`,
      "text/csv"
    );

    setStatus(`${tabs.length} abas exportadas em CSV.`);
  } catch (error) {
    console.error("Erro ao exportar CSV:", error);
    setStatus("Erro ao exportar CSV.");
  }
});


// =========================
// JSON
// =========================

document.getElementById("json").addEventListener("click", async () => {
  try {
    const tabs = await getTabs();

    const backup = {
      exportedAt: new Date().toISOString(),
      tabCount: tabs.length,
      windowCount: new Set(
        tabs.map((tab) => tab.windowId)
      ).size,
      tabs
    };

    const content = JSON.stringify(backup, null, 2);

    await downloadData(
      content,
      `chrome-tabs-${timestamp()}.json`,
      "application/json"
    );

    setStatus(`${tabs.length} abas exportadas em JSON.`);
  } catch (error) {
    console.error("Erro ao exportar JSON:", error);
    setStatus("Erro ao exportar JSON.");
  }
});


document
.getElementById("openRestore")
.addEventListener("click", () => {

  chrome.tabs.create({
    url: chrome.runtime.getURL("restore.html")
  });

});