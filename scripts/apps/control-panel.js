/**
 * The GM's control panel: the playlist library (with folders) on the left, scenarios and custom
 * themes with their bound playlists on the right. Drag a playlist onto a scenario to bind it, onto
 * a folder to move it; drag a folder onto a scenario to bind everything inside it.
 */

import { MODULE_ID, SETTINGS, localize, escapeHTML } from "../constants.js";
import * as library from "../library.js";
import * as playback from "../state.js";
import { SpotifyAuth } from "../backends/spotify.js";
import { SUGGESTIONS } from "../suggestions.js";
import * as transfer from "../transfer.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const DRAG_TYPE = "dxcufgbs-scenario-soundtrack";

/* -------------------------------------------- */
/*  Dialog helpers                               */
/* -------------------------------------------- */

function readForm(form) {
  const data = {};
  for (const element of form.elements) {
    if (!element.name) continue;
    if (element.type === "checkbox") data[element.name] = element.checked;
    else if (element.type === "number") data[element.name] = Number(element.value);
    else data[element.name] = String(element.value ?? "").trim();
  }
  return data;
}

async function formDialog(title, icon, content, okLabel) {
  return DialogV2.prompt({
    window: { title, icon },
    position: { width: 480 },
    content: `<div class="sst-dialog">${content}</div>`,
    ok: { label: okLabel ?? localize("Dialog.Save"), icon: "fa-solid fa-check", callback: (event, button) => readForm(button.form) },
    rejectClose: false
  });
}

function options(items, selected) {
  return items.map(item => `<option value="${escapeHTML(item.id)}"${item.id === (selected ?? "") ? " selected" : ""}>${escapeHTML(item.label)}</option>`).join("");
}

function field(label, input, hint = "") {
  return `<div class="form-group"><label>${escapeHTML(label)}</label><div class="form-fields">${input}</div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
}

async function confirm(title, text) {
  return DialogV2.confirm({
    window: { title, icon: "fa-solid fa-trash" },
    content: `<p>${text}</p>`,
    rejectClose: false
  });
}

/** Ask for a playlist's details, re-asking while the link isn't understood. */
async function listDialog(lib, list = {}, defaults = {}) {
  let values = { name: list.name ?? "", url: list.url ?? "", folder: list.folder ?? defaults.folder ?? "", shuffle: list.shuffle ?? true, volume: list.volume ?? 1 };
  for (;;) {
    const content = [
      field(localize("Dialog.Link"), `<input type="text" name="url" value="${escapeHTML(values.url)}" placeholder="https://open.spotify.com/playlist/…" autofocus>`,
        escapeHTML(localize("Dialog.LinkHint"))),
      field(localize("Dialog.Name"), `<input type="text" name="name" value="${escapeHTML(values.name)}" placeholder="${escapeHTML(localize("Dialog.NameAuto"))}">`),
      field(localize("Dialog.Folder"), `<select name="folder">${options(library.folderOptions(lib), values.folder)}</select>`),
      field(localize("Dialog.Shuffle"), `<input type="checkbox" name="shuffle"${values.shuffle ? " checked" : ""}>`, escapeHTML(localize("Dialog.ShuffleHint"))),
      field(localize("Dialog.Volume"), `<input type="number" name="volumePercent" value="${Math.round(values.volume * 100)}" min="5" max="100" step="5"> <span class="units">%</span>`,
        escapeHTML(localize("Dialog.VolumeHint")))
    ].join("");
    const result = await formDialog(localize(list.id ? "Dialog.EditList" : "Dialog.CreateList"), "fa-solid fa-list-music", content);
    if (!result) return null;
    const { volumePercent, ...rest } = result;
    values = { ...values, ...rest, volume: Math.clamp((Number(volumePercent) || 100) / 100, 0.05, 1) };
    if (!library.parseSource(values.url)) {
      ui.notifications.error(localize("Notify.InvalidLink"));
      continue;
    }
    if (library.parseSource(values.url).source === "spotify" && !SpotifyAuth.configured) {
      ui.notifications.warn(localize("Notify.SpotifyNotSetUp"));
    }
    if (!values.name) values.name = (await library.fetchTitle(values.url)) ?? library.sourceLabel(library.parseSource(values.url));
    return values;
  }
}

async function folderDialog(lib, folder = {}, defaults = {}) {
  const parentOptions = library.folderOptions(lib).filter(o => !folder.id || !library.folderDescendants(lib, folder.id).has(o.id));
  const content = [
    field(localize("Dialog.Name"), `<input type="text" name="name" value="${escapeHTML(folder.name ?? "")}" autofocus>`),
    field(localize("Dialog.ParentFolder"), `<select name="parent">${options(parentOptions, folder.parent ?? defaults.parent ?? "")}</select>`)
  ].join("");
  return formDialog(localize(folder.id ? "Dialog.EditFolder" : "Dialog.CreateFolder"), "fa-solid fa-folder", content);
}

async function scenarioDialog(scenario = {}) {
  const modes = [
    { id: "random", label: localize("Scenario.ModeRandom") },
    { id: "sequence", label: localize("Scenario.ModeSequence") }
  ];
  const content = [
    field(localize("Dialog.Name"), `<input type="text" name="name" value="${escapeHTML(scenario.id ? library.scenarioName(scenario) : "")}" autofocus>`),
    field(localize("Dialog.Icon"), `<input type="text" name="icon" value="${escapeHTML(scenario.icon ?? "fa-solid fa-music")}">`,
      localize("Dialog.IconHint")),
    field(localize("Dialog.Mode"), `<select name="mode">${options(modes, scenario.mode ?? "random")}</select>`, escapeHTML(localize("Dialog.ModeHint")))
  ].join("");
  return formDialog(localize(scenario.id ? "Dialog.EditScenario" : "Dialog.CreateScenario"), "fa-solid fa-masks-theater", content);
}

/** Pick suggested playlists to add; resolves to the chosen entries (or null). */
async function suggestionsDialog(lib) {
  const groups = lib.scenarios
    .map(scenario => ({ scenario, items: SUGGESTIONS.map((item, index) => ({ ...item, index })).filter(i => i.scenario === scenario.id) }))
    .filter(g => g.items.length);
  const rows = groups.map(({ scenario, items }) => `
    <fieldset>
      <legend><i class="${escapeHTML(scenario.icon)}"></i> ${escapeHTML(library.scenarioName(scenario))}</legend>
      ${items.map(item => {
        const parsed = library.parseSource(item.url);
        const have = lib.lists.find(l => library.sameSource(l.url, item.url));
        const isBound = have && scenario.lists.includes(have.id);
        return `<label class="sst-suggestion${isBound ? " added" : ""}">
          <input type="checkbox" name="pick" value="${item.index}"${isBound ? " disabled" : " checked"}>
          <i class="${library.sourceIcon(parsed)}" data-tooltip="${escapeHTML(library.sourceLabel(parsed))}"></i>
          <span class="sst-name">${escapeHTML(item.name)}</span>
          ${isBound ? `<span class="sst-count">${escapeHTML(localize("Suggestions.AlreadyAdded"))}</span>` : ""}
          <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener" data-tooltip="${escapeHTML(localize("Suggestions.Preview"))}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        </label>`;
      }).join("")}
    </fieldset>`).join("");
  return DialogV2.prompt({
    window: { title: localize("Suggestions.Title"), icon: "fa-solid fa-wand-magic-sparkles" },
    position: { width: 560 },
    content: `<div class="sst-dialog sst-suggestions"><p class="hint">${escapeHTML(localize("Suggestions.Intro"))}</p>${rows}</div>`,
    ok: {
      label: localize("Suggestions.Add"),
      icon: "fa-solid fa-plus",
      callback: (event, button) => [...button.form.querySelectorAll("input[name=pick]:checked:not(:disabled)")]
        .map(input => SUGGESTIONS[Number(input.value)]).filter(Boolean)
    },
    rejectClose: false
  });
}

/** Ask for an export file; resolves to its parsed content (or null). */
async function pickImportFile() {
  const file = await DialogV2.prompt({
    window: { title: localize("Transfer.ImportTitle"), icon: "fa-solid fa-file-import" },
    position: { width: 440 },
    content: `<div class="sst-dialog">
      <p>${escapeHTML(localize("Transfer.PickFile"))}</p>
      <div class="form-group"><div class="form-fields"><input type="file" name="file" accept=".json,application/json"></div></div>
    </div>`,
    ok: { label: localize("Transfer.Next"), icon: "fa-solid fa-arrow-right", callback: (event, button) => button.form.elements.file.files?.[0] ?? null },
    rejectClose: false
  });
  if (!file) return null;
  return transfer.parseExport(await foundry.utils.readTextFromFile(file));
}

/** Show what an export contains and how to import it; resolves to { mode, scenes } (or null). */
async function importOptionsDialog(parsed) {
  const lib = parsed.library;
  const themes = lib.scenarios.filter(s => !s.builtin).length;
  const bindings = lib.scenarios.reduce((sum, s) => sum + s.lists.length, 0);
  const matches = transfer.matchingScenes(parsed.scenes).length;
  const date = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString(game.i18n.lang) : "";
  const summary = localize("Transfer.Summary", {
    lists: lib.lists.length, folders: lib.folders.length, themes, bindings
  });
  const source = parsed.world || date
    ? `<p class="hint">${escapeHTML(localize("Transfer.Source", { world: parsed.world || "?", date: date || "?" }))}</p>` : "";
  const content = `<div class="sst-dialog sst-import-dialog">
    ${source}
    <p>${escapeHTML(summary)}</p>
    <div class="form-group stacked">
      <label class="checkbox"><input type="radio" name="mode" value="merge" checked> ${escapeHTML(localize("Transfer.Merge"))}</label>
      <p class="hint">${escapeHTML(localize("Transfer.MergeHint"))}</p>
      <label class="checkbox"><input type="radio" name="mode" value="replace"> ${escapeHTML(localize("Transfer.Replace"))}</label>
      <p class="hint">${escapeHTML(localize("Transfer.ReplaceHint"))}</p>
    </div>
    ${parsed.scenes.length ? `<div class="form-group">
      <label class="checkbox"><input type="checkbox" name="scenes"${matches ? " checked" : " disabled"}>
        ${escapeHTML(localize("Transfer.Scenes", { matches, total: parsed.scenes.length }))}</label>
    </div>` : ""}
  </div>`;
  return DialogV2.prompt({
    window: { title: localize("Transfer.ImportTitle"), icon: "fa-solid fa-file-import" },
    position: { width: 480 },
    content,
    ok: {
      label: localize("Transfer.Import"),
      icon: "fa-solid fa-file-import",
      callback: (event, button) => ({
        mode: button.form.querySelector("input[name=mode]:checked")?.value ?? "merge",
        scenes: !!button.form.elements.scenes?.checked
      })
    },
    rejectClose: false
  });
}

/* -------------------------------------------- */
/*  Panel                                        */
/* -------------------------------------------- */

export class ControlPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dxcufgbs-scenario-soundtrack-panel",
    classes: ["dxcufgbs-scenario-soundtrack"],
    tag: "div",
    window: { title: "SST.Panel.Title", icon: "fa-solid fa-compact-disc", resizable: true },
    position: { width: 1240, height: 860 },
    actions: {
      createFolder: ControlPanel._onCreateFolder,
      editFolder: ControlPanel._onEditFolder,
      deleteFolder: ControlPanel._onDeleteFolder,
      toggleFolder: ControlPanel._onToggleFolder,
      createList: ControlPanel._onCreateList,
      editList: ControlPanel._onEditList,
      deleteList: ControlPanel._onDeleteList,
      playList: ControlPanel._onPlayList,
      createScenario: ControlPanel._onCreateScenario,
      editScenario: ControlPanel._onEditScenario,
      deleteScenario: ControlPanel._onDeleteScenario,
      playScenario: ControlPanel._onPlayScenario,
      playBound: ControlPanel._onPlayBound,
      unbindList: ControlPanel._onUnbindList,
      stop: () => playback.stop(),
      togglePause: () => playback.togglePause(),
      skipTrack: () => playback.skipTrack(),
      nextList: () => playback.nextList(),
      addSuggestions: ControlPanel._onAddSuggestions,
      exportSetup: ControlPanel._onExportSetup,
      importSetup: ControlPanel._onImportSetup,
      copyRedirect: ControlPanel._onCopyRedirect,
      saveClientId: ControlPanel._onSaveClientId
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/control-panel.hbs`,
      scrollable: [".sst-tree", ".sst-scenario-grid"]
    }
  };

  #filter = "";

  get expanded() {
    return new Set(game.settings.get(MODULE_ID, SETTINGS.expandedFolders) ?? []);
  }

  /* -------------------------------------------- */

  async _prepareContext() {
    const lib = library.getLibrary();
    const state = playback.getState();
    const expanded = this.expanded;
    const boundCount = id => lib.scenarios.filter(s => s.lists.includes(id)).length;

    // Flat tree: folders and lists with their depth and the folders they sit in
    // (rows inside closed folders are hidden by #applyFilter, so searching can still find them).
    const tree = [];
    const walk = (parent, depth, ancestors) => {
      for (const folder of library.sortByName(lib.folders.filter(f => (f.parent ?? null) === parent))) {
        tree.push({
          isFolder: true, id: folder.id, name: folder.name, depth, ancestors: ancestors.join(" "),
          expanded: expanded.has(folder.id), count: library.listsInFolder(lib, folder.id).length
        });
        walk(folder.id, depth + 1, [...ancestors, folder.id]);
      }
      for (const list of library.sortByName(lib.lists.filter(l => (l.folder ?? null) === parent))) {
        const parsed = library.parseSource(list.url);
        tree.push({
          isFolder: false, id: list.id, name: list.name, depth, url: list.url, folder: list.folder ?? "", ancestors: ancestors.join(" "),
          icon: library.sourceIcon(parsed), sourceLabel: library.sourceLabel(parsed), invalid: !parsed,
          bound: boundCount(list.id), playing: state.listId === list.id
        });
      }
    };
    walk(null, 0, []);

    const listLabel = list => {
      const path = library.folderPath(lib, list.folder);
      return path ? `${path} / ${list.name}` : list.name;
    };
    const allLists = [...lib.lists].sort((a, b) => listLabel(a).localeCompare(listLabel(b), game.i18n.lang, { numeric: true }));

    const scenarios = lib.scenarios.map(scenario => ({
      id: scenario.id,
      name: library.scenarioName(scenario),
      icon: scenario.icon,
      custom: !scenario.builtin,
      active: state.scenarioId === scenario.id,
      modeLabel: localize(scenario.mode === "sequence" ? "Scenario.ModeSequence" : "Scenario.ModeRandom"),
      lists: scenario.lists.map(id => lib.lists.find(l => l.id === id)).filter(Boolean).map(list => ({
        id: list.id, name: list.name, icon: library.sourceIcon(library.parseSource(list.url)),
        playing: state.scenarioId === scenario.id && state.listId === list.id
      })),
      options: allLists.filter(l => !scenario.lists.includes(l.id)).map(l => ({ id: l.id, label: listLabel(l) }))
    }));

    const nowList = lib.lists.find(l => l.id === state.listId);
    const nowScenario = lib.scenarios.find(s => s.id === state.scenarioId);
    const now = nowList ? {
      title: nowScenario ? library.scenarioName(nowScenario) : nowList.name,
      subtitle: nowScenario ? nowList.name : localize("Panel.SingleList"),
      icon: library.sourceIcon(library.parseSource(nowList.url)),
      paused: !!state.paused,
      scenario: !!nowScenario && nowScenario.lists.length > 1,
      auto: !!state.auto
    } : null;

    const combatOptions = [{ id: "", label: localize("Automation.None") }, ...lib.scenarios.map(s => ({ id: s.id, label: library.scenarioName(s) }))];

    return {
      now,
      tree,
      empty: !lib.lists.length && !lib.folders.length,
      scenarios,
      filter: this.#filter,
      automation: {
        combatOptions: combatOptions.map(o => ({ ...o, selected: o.id === (lib.automation.combat ?? "") })),
        restore: lib.automation.restoreAfterCombat
      },
      spotify: {
        clientId: SpotifyAuth.clientId,
        redirectUri: SpotifyAuth.redirectUri,
        secure: window.isSecureContext
      }
    };
  }

  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const root = this.element;

    root.addEventListener("dragstart", event => {
      const row = event.target.closest?.("[data-drag]");
      if (!row) return;
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, kind: row.dataset.drag, id: row.dataset.id }));
      event.dataTransfer.effectAllowed = "copyMove";
      row.classList.add("dragging");
    });
    root.addEventListener("dragend", event => event.target.closest?.("[data-drag]")?.classList.remove("dragging"));
    root.addEventListener("dragover", event => {
      const target = event.target.closest?.("[data-drop-folder], [data-drop-scenario]");
      if (!target) return;
      event.preventDefault();
      root.querySelectorAll(".drop-hover").forEach(el => el !== target && el.classList.remove("drop-hover"));
      target.classList.add("drop-hover");
    });
    root.addEventListener("dragleave", event => {
      const target = event.target.closest?.("[data-drop-folder], [data-drop-scenario]");
      if (target && !target.contains(event.relatedTarget)) target.classList.remove("drop-hover");
    });
    root.addEventListener("drop", event => this.#onDrop(event));

    root.addEventListener("change", event => {
      const select = event.target.closest?.("select[data-bind-scenario]");
      if (select?.value) return library.bindLists(select.dataset.bindScenario, [select.value]);
      if (event.target.name === "automationCombat") return library.updateAutomation({ combat: event.target.value });
      if (event.target.name === "automationRestore") return library.updateAutomation({ restoreAfterCombat: event.target.checked });
    });

    root.addEventListener("input", event => {
      if (!event.target.matches?.("input.sst-filter")) return;
      this.#filter = event.target.value.trim().toLowerCase();
      this.#applyFilter();
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#applyFilter();
  }

  /** Hide rows that don't match the search box (folders stay when something inside them matches). */
  #applyFilter() {
    const rows = [...this.element.querySelectorAll(".sst-tree > li[data-drag]")];
    if (!this.#filter) {
      const expanded = this.expanded;
      for (const row of rows) {
        const ancestors = row.dataset.ancestors ? row.dataset.ancestors.split(" ") : [];
        row.hidden = !ancestors.every(id => expanded.has(id));
      }
      return;
    }
    const lib = library.getLibrary();
    const visibleFolders = new Set();
    for (const list of lib.lists) {
      if (!list.name.toLowerCase().includes(this.#filter) && !list.url.toLowerCase().includes(this.#filter)) continue;
      let folder = lib.folders.find(f => f.id === list.folder);
      while (folder && !visibleFolders.has(folder.id)) {
        visibleFolders.add(folder.id);
        folder = lib.folders.find(f => f.id === folder.parent);
      }
    }
    for (const row of rows) {
      const name = row.querySelector(".sst-name")?.textContent.toLowerCase() ?? "";
      const url = (row.dataset.url ?? "").toLowerCase();
      row.hidden = row.dataset.drag === "folder"
        ? !visibleFolders.has(row.dataset.id) && !name.includes(this.#filter)
        : !name.includes(this.#filter) && !url.includes(this.#filter);
    }
  }

  async #onDrop(event) {
    const target = event.target.closest?.("[data-drop-folder], [data-drop-scenario]");
    this.element.querySelectorAll(".drop-hover").forEach(el => el.classList.remove("drop-hover"));
    if (!target) return;
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data?.type !== DRAG_TYPE) return;
    event.preventDefault();
    event.stopPropagation();

    if ("dropScenario" in target.dataset) {
      const lib = library.getLibrary();
      const ids = data.kind === "folder" ? library.listsInFolder(lib, data.id).map(l => l.id) : [data.id];
      const added = await library.bindLists(target.dataset.dropScenario, ids);
      if (data.kind === "folder") ui.notifications.info(localize("Notify.BoundFolder", { count: added }));
      return;
    }
    const folder = target.dataset.dropFolder || null;
    if (data.kind === "list") await library.moveList(data.id, folder);
    else if (data.kind === "folder" && data.id !== folder) {
      if (!(await library.moveFolder(data.id, folder))) ui.notifications.warn(localize("Notify.FolderIntoItself"));
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async _onCreateFolder(event, target) {
    const lib = library.getLibrary();
    const parent = target.closest("[data-drag=folder]")?.dataset.id ?? "";
    const data = await folderDialog(lib, {}, { parent });
    if (!data) return;
    const folder = await library.createFolder(data);
    if (data.parent) await this._setExpanded(data.parent, true);
    return folder;
  }

  static async _onEditFolder(event, target) {
    const lib = library.getLibrary();
    const folder = lib.folders.find(f => f.id === target.closest("[data-drag]").dataset.id);
    if (!folder) return;
    const data = await folderDialog(lib, folder);
    if (!data) return;
    await library.updateFolder(folder.id, { name: data.name || folder.name });
    if ((data.parent || null) !== (folder.parent ?? null)) await library.moveFolder(folder.id, data.parent);
  }

  static async _onDeleteFolder(event, target) {
    const lib = library.getLibrary();
    const folder = lib.folders.find(f => f.id === target.closest("[data-drag]").dataset.id);
    if (!folder) return;
    const ok = await confirm(localize("Dialog.DeleteFolder"), localize("Dialog.DeleteFolderText", { name: escapeHTML(folder.name) }));
    if (ok) await library.deleteFolder(folder.id);
  }

  static async _onToggleFolder(event, target) {
    const id = target.closest("[data-drag]").dataset.id;
    await this._setExpanded(id, !this.expanded.has(id));
    this.render();
  }

  async _setExpanded(id, open) {
    const expanded = this.expanded;
    if (open) expanded.add(id);
    else expanded.delete(id);
    await game.settings.set(MODULE_ID, SETTINGS.expandedFolders, [...expanded]);
  }

  static async _onCreateList(event, target) {
    const lib = library.getLibrary();
    const folder = target.closest("[data-drag=folder]")?.dataset.id ?? "";
    const data = await listDialog(lib, {}, { folder });
    if (!data) return;
    await library.createList(data);
    if (data.folder) await this._setExpanded(data.folder, true);
  }

  static async _onEditList(event, target) {
    const lib = library.getLibrary();
    const list = lib.lists.find(l => l.id === target.closest("[data-drag]").dataset.id);
    if (!list) return;
    const data = await listDialog(lib, list);
    if (data) await library.updateList(list.id, { ...data, folder: data.folder || null });
  }

  static async _onDeleteList(event, target) {
    const lib = library.getLibrary();
    const list = lib.lists.find(l => l.id === target.closest("[data-drag]").dataset.id);
    if (!list) return;
    const ok = await confirm(localize("Dialog.DeleteList"), localize("Dialog.DeleteListText", { name: escapeHTML(list.name) }));
    if (!ok) return;
    if (playback.getState().listId === list.id) await playback.stop();
    await library.deleteList(list.id);
  }

  static async _onPlayList(event, target) {
    return playback.playList(target.closest("[data-drag]").dataset.id);
  }

  static async _onCreateScenario() {
    const data = await scenarioDialog();
    if (data) await library.createScenario(data);
  }

  static async _onEditScenario(event, target) {
    const lib = library.getLibrary();
    const scenario = lib.scenarios.find(s => s.id === target.closest("[data-scenario-id]").dataset.scenarioId);
    if (!scenario) return;
    const data = await scenarioDialog(scenario);
    if (!data) return;
    // Keep built-in scenarios translated unless the GM actually changed the name.
    const name = scenario.builtin && data.name === library.scenarioName({ ...scenario, name: "" }) ? "" : data.name;
    await library.updateScenario(scenario.id, { name, icon: data.icon || scenario.icon, mode: data.mode });
  }

  static async _onDeleteScenario(event, target) {
    const lib = library.getLibrary();
    const scenario = lib.scenarios.find(s => s.id === target.closest("[data-scenario-id]").dataset.scenarioId);
    if (!scenario || scenario.builtin) return;
    const ok = await confirm(localize("Dialog.DeleteScenario"), localize("Dialog.DeleteScenarioText", { name: escapeHTML(library.scenarioName(scenario)) }));
    if (!ok) return;
    if (playback.getState().scenarioId === scenario.id) await playback.stop();
    await library.deleteScenario(scenario.id);
  }

  static async _onPlayScenario(event, target) {
    return playback.playScenario(target.closest("[data-scenario-id]").dataset.scenarioId);
  }

  static async _onPlayBound(event, target) {
    const scenarioId = target.closest("[data-scenario-id]").dataset.scenarioId;
    return playback.playScenario(scenarioId, { listId: target.closest("[data-list-id]").dataset.listId });
  }

  static async _onUnbindList(event, target) {
    const scenarioId = target.closest("[data-scenario-id]").dataset.scenarioId;
    return library.unbindList(scenarioId, target.closest("[data-list-id]").dataset.listId);
  }

  static async _onAddSuggestions() {
    const picked = await suggestionsDialog(library.getLibrary());
    if (!picked?.length) return;
    const { added, bound } = await library.addSuggestions(picked);
    ui.notifications.info(localize("Suggestions.Done", { added, bound }));
  }

  static async _onExportSetup() {
    const data = transfer.exportToFile();
    ui.notifications.info(localize("Transfer.Exported", { lists: data.library.lists.length }));
  }

  static async _onImportSetup() {
    let parsed;
    try {
      parsed = await pickImportFile();
    } catch (err) {
      ui.notifications.error(err.message);
      return;
    }
    if (!parsed) return;
    const options = await importOptionsDialog(parsed);
    if (!options) return;
    if (options.mode === "replace") {
      const ok = await confirm(localize("Transfer.Replace"), escapeHTML(localize("Transfer.ReplaceConfirm")));
      if (!ok) return;
    }
    const result = await transfer.applyImport(parsed, options);
    ui.notifications.info(localize("Transfer.Imported", result));
  }

  static async _onCopyRedirect() {
    await game.clipboard.copyPlainText(SpotifyAuth.redirectUri);
    ui.notifications.info(localize("Spotify.RedirectCopied"));
  }

  static async _onSaveClientId(event, target) {
    const input = this.element.querySelector("input[name=spotifyClientId]");
    await game.settings.set(MODULE_ID, SETTINGS.spotifyClientId, input?.value.trim() ?? "");
    ui.notifications.info(localize("Spotify.ClientIdSaved"));
  }
}
