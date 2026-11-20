// ========================================
// THEME (light / dark / system)
// Loaded in <head>, before the page is drawn, so the right colors show up
// on the first paint. The choice is kept in localStorage; "system" (the
// default) follows the device setting and updates when it changes.
// ========================================
(function () {
  const STORAGE_KEY = 'openTeamworkTheme';
  const CHOICES = ['system', 'light', 'dark'];
  const LABELS = { system: 'Padrão do sistema', light: 'Claro', dark: 'Escuro' };
  const ICONS = {
    system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  };
  const BAR_COLORS = { light: '#f6f8fa', dark: '#010409' };
  const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getChoice() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return CHOICES.includes(saved) ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  function resolve(choice) {
    if (choice === 'light' || choice === 'dark') return choice;
    return systemQuery.matches ? 'dark' : 'light';
  }

  function apply() {
    const choice = getChoice();
    const theme = resolve(choice);
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themeChoice = choice;
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', BAR_COLORS[theme]);
    });
    updateMenu(choice);
  }

  function setChoice(choice) {
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Private mode without storage: the choice lasts until the page closes.
    }
    apply();
  }

  function icon(choice) {
    return `<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[choice]}</svg>`;
  }

  // ----- Menu in the header -----
  let button = null;
  let menu = null;

  function updateMenu(choice) {
    if (!button || !menu) return;
    button.innerHTML = icon(choice);
    button.setAttribute('aria-label', `Tema: ${LABELS[choice]}`);
    button.title = `Tema: ${LABELS[choice]}`;
    menu.querySelectorAll('[data-theme-option]').forEach(option => {
      option.setAttribute('aria-checked', String(option.dataset.themeOption === choice));
    });
  }

  function closeMenu(returnFocus) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  }

  function openMenu() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const current = menu.querySelector('[aria-checked="true"]') || menu.querySelector('[data-theme-option]');
    current.focus();
  }

  function buildMenu() {
    const holder = document.querySelector('[data-theme-switcher]');
    if (!holder) return;

    holder.innerHTML = `
      <button type="button" class="icon-button theme-button" aria-haspopup="menu" aria-expanded="false"></button>
      <div class="theme-menu" role="menu" aria-label="Tema" hidden>
        <p class="theme-menu-title">Tema</p>
        ${CHOICES.map(choice => `
          <button type="button" class="theme-option" role="menuitemradio" data-theme-option="${choice}" aria-checked="false">
            ${icon(choice)}<span>${LABELS[choice]}</span>
            <svg class="theme-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          </button>`).join('')}
      </div>`;
    button = holder.querySelector('.theme-button');
    menu = holder.querySelector('.theme-menu');

    button.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu(false)));
    menu.addEventListener('click', event => {
      const option = event.target.closest('[data-theme-option]');
      if (!option) return;
      setChoice(option.dataset.themeOption);
      closeMenu(true);
    });
    menu.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('[data-theme-option]')];
      const index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        options[(index + step + options.length) % options.length].focus();
      } else if (event.key === 'Escape') {
        closeMenu(true);
      } else if (event.key === 'Tab') {
        closeMenu(false);
      }
    });
    document.addEventListener('click', event => {
      if (!holder.contains(event.target)) closeMenu(false);
    });
    updateMenu(getChoice());
  }

  apply();
  systemQuery.addEventListener('change', () => {
    if (getChoice() === 'system') apply();
  });
  // Another tab changed the theme.
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) apply();
  });
  document.addEventListener('DOMContentLoaded', buildMenu);
})();
