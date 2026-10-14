import { CartLinesUpdateEvent } from '@shopify/events';

class GenetixProduct extends HTMLElement {
  connectedCallback() {
    if (this.abortController) return;
    this.abortController = new AbortController();
    this.addEventListener('click', this.onClick, { signal: this.abortController.signal });
    this.addEventListener('change', this.onChange, { signal: this.abortController.signal });
    this.form = this.querySelector('form');
    this.form?.addEventListener('submit', this.onSubmit, { signal: this.abortController.signal });
  }
  disconnectedCallback() { this.abortController?.abort(); this.abortController = null; }
  onClick = (event) => {
    const open = event.target.closest('[data-zoom-open]');
    if (open) { this.querySelector('dialog')?.showModal(); return; }
    const close = event.target.closest('[data-zoom-close]');
    if (close) { this.querySelector('dialog')?.close(); return; }
    const thumb = event.target.closest('[data-media-src]');
    if (!thumb) return;
    const image = this.querySelector('[data-main-image]');
    if (image) { image.src = thumb.dataset.mediaSrc; image.srcset = ''; image.alt = thumb.dataset.mediaAlt || ''; }
    const zoom = this.querySelector('[data-zoom-image]');
    if (zoom) { zoom.src = thumb.dataset.mediaSrc; zoom.alt = thumb.dataset.mediaAlt || ''; }
    this.querySelectorAll('[data-media-src]').forEach((button) => button.setAttribute('aria-current', String(button === thumb)));
  };
  onChange = (event) => {
    if (!event.target.matches('[data-variant-select]')) return;
    const option = event.target.selectedOptions[0];
    const price = this.querySelector('[data-price]');
    if (price) price.textContent = option.dataset.price || '';
    const button = this.querySelector('[type="submit"]');
    if (button) button.disabled = option.dataset.available !== 'true';
  };
  onSubmit = async (event) => {
    event.preventDefault();
    const button = this.querySelector('[type="submit"]');
    const error = this.querySelector('[data-error]');
    if (!this.form || !button) return;
    button.disabled = true; button.setAttribute('aria-busy', 'true'); error.textContent = '';
    const promise = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(new CartLinesUpdateEvent({ action: 'add', context: 'product', lines: [{ merchandiseId: String(new FormData(this.form).get('id')), quantity: 1 }], promise: promise.promise }));
    try {
      const data = new FormData(this.form);
      data.append('sections', 'cart-drawer-section');
      const response = await fetch(Theme.routes.cart_add_url, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
      const added = await response.json();
      if (!response.ok || added.status) throw new Error(added.description || added.message || 'Unable to add this item.');
      const cartResponse = await fetch(`${Theme.routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
      const cart = await cartResponse.json();
      promise.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart), detail: { items: cart.items, sections: added.sections, source: 'genetix-featured-product', sourceId: this.id, itemCount: 1, didError: false } });
    } catch (exception) { error.textContent = exception.message; promise.reject(exception); }
    finally { button.disabled = this.querySelector('[data-variant-select]')?.selectedOptions[0]?.dataset.available !== 'true'; button.removeAttribute('aria-busy'); }
  };
}
if (!customElements.get('genetix-product')) customElements.define('genetix-product', GenetixProduct);
