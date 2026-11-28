/**
 * Placeholder splash screen. Phase 2 replaces it with the animated logo
 * and the screen flow: splash → categories → bookshelf → book.
 */
export function showSplash(root: HTMLElement): void {
  root.innerHTML = `
    <main class="splash" aria-label="מסך פתיחה">
      <img class="splash__logo" src="./icons/icon.svg" alt="" width="180" height="180" />
      <h1 class="splash__title">Miriam Coloring Books</h1>
      <p class="splash__subtitle">חוברות צביעה קסומות לפי מספרים</p>
      <p class="splash__status">שלד הפרויקט מוכן. המסכים האמיתיים יגיעו בשלב 2.</p>
    </main>
  `;
}
