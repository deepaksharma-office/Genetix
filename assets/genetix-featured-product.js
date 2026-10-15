import { CartLinesUpdateEvent } from '@shopify/events';

class GenetixProduct extends HTMLElement {
  connectedCallback() {
    if (this.abortController) return;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.form = this.querySelector('form');
    this.addEventListener('click', this.onClick, { signal });
    this.addEventListener('change', this.onChange, { signal });
    window.addEventListener('resize', this.onResize, { signal });
    this.form?.addEventListener('submit', this.onSubmit, { signal });
  }

  disconnectedCallback() {
    this.abortController?.abort();
    this.abortController = null;
  }

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const open = target.closest('[data-zoom-open]');
    if (open) {
      this.querySelector('dialog')?.showModal();
      return;
    }
    const close = target.closest('[data-zoom-close]');
    if (close) {
      this.querySelector('dialog')?.close();
      return;
    }
    const thumb = target.closest('[data-media-src]');
    if (thumb instanceof HTMLElement) {
      this.updateMedia(thumb);
      return;
    }
    const quantityButton = target.closest('[data-quantity-minus], [data-quantity-plus]');
    if (quantityButton) {
      this.updateQuantity(quantityButton.hasAttribute('data-quantity-plus') ? 1 : -1);
      return;
    }
    const accordion = target.closest('[data-accordion-trigger]');
    if (accordion instanceof HTMLButtonElement) this.toggleAccordion(accordion);
  };

  onChange = (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches('[data-variant-select]')) return;
    const option = select.selectedOptions[0];
    const price = option.dataset.price || '';
    this.querySelectorAll('[data-price], [data-button-price]').forEach((element) => { element.textContent = price; });
    const button = this.querySelector('[type="submit"]');
    if (button instanceof HTMLButtonElement) button.disabled = option.dataset.available !== 'true';
    const input = this.querySelector('[data-quantity-input]');
    if (!(input instanceof HTMLInputElement)) return;
    input.min = option.dataset.min || '1';
    input.step = option.dataset.step || '1';
    if (option.dataset.max) input.max = option.dataset.max;
    else input.removeAttribute('max');
    input.value = input.min;
  };

  onResize = () => {
    const trigger = this.querySelector('[data-accordion-trigger][aria-expanded="true"]');
    if (!(trigger instanceof HTMLButtonElement)) return;
    const panel = this.getAccordionPanel(trigger);
    if (panel) panel.style.height = `${panel.scrollHeight}px`;
  };

  updateMedia(thumb) {
    const image = this.querySelector('[data-main-image]');
    if (image instanceof HTMLImageElement) {
      image.src = thumb.dataset.mediaSrc || '';
      image.srcset = '';
      image.alt = thumb.dataset.mediaAlt || '';
    }
    const zoom = this.querySelector('[data-zoom-image]');
    if (zoom instanceof HTMLImageElement) {
      zoom.src = thumb.dataset.mediaSrc || '';
      zoom.alt = thumb.dataset.mediaAlt || '';
    }
    this.querySelectorAll('[data-media-src]').forEach((button) => button.setAttribute('aria-current', String(button === thumb)));
  }

  updateQuantity(direction) {
    const input = this.querySelector('[data-quantity-input]');
    if (!(input instanceof HTMLInputElement)) return;
    const min = Number(input.min) || 1;
    const max = input.max ? Number(input.max) : Infinity;
    const step = Number(input.step) || 1;
    const current = Number(input.value) || min;
    input.value = String(Math.min(max, Math.max(min, current + direction * step)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  toggleAccordion(trigger) {
    const opening = trigger.getAttribute('aria-expanded') !== 'true';
    for (const item of this.querySelectorAll('[data-accordion-trigger]')) {
      item.setAttribute('aria-expanded', 'false');
      const panel = this.getAccordionPanel(item);
      if (panel) panel.style.height = '0px';
    }
    if (!opening) return;
    const panel = this.getAccordionPanel(trigger);
    trigger.setAttribute('aria-expanded', 'true');
    if (panel) panel.style.height = `${panel.scrollHeight}px`;
  }

  getAccordionPanel(trigger) {
    const id = trigger.getAttribute('aria-controls');
    const panel = id ? document.getElementById(id) : null;
    return panel instanceof HTMLElement ? panel : null;
  }

  onSubmit = async (event) => {
    event.preventDefault();
    const button = this.querySelector('[type="submit"]');
    const error = this.querySelector('[data-error]');
    if (!this.form || !(button instanceof HTMLButtonElement) || !(error instanceof HTMLElement)) return;
    const data = new FormData(this.form);
    const quantity = Number(data.get('quantity')) || 1;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    error.textContent = '';
    const promise = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(new CartLinesUpdateEvent({ action: 'add', context: 'product', lines: [{ merchandiseId: String(data.get('id')), quantity }], promise: promise.promise }));
    try {
      data.append('sections', 'cart-drawer-section');
      const response = await fetch(Theme.routes.cart_add_url, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
      const added = await response.json();
      if (!response.ok || added.status) throw new Error(added.description || added.message || 'Unable to add this item.');
      const cartResponse = await fetch(`${Theme.routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
      if (!cartResponse.ok) throw new Error('Unable to refresh the cart.');
      const cart = await cartResponse.json();
      promise.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart), detail: { items: cart.items, sections: added.sections, source: 'genetix-featured-product', sourceId: this.id, itemCount: quantity, didError: false } });
    } catch (exception) {
      error.textContent = exception instanceof Error ? exception.message : 'Unable to add this item.';
      promise.reject(exception);
    } finally {
      const option = this.querySelector('[data-variant-select]')?.selectedOptions[0];
      button.disabled = option ? option.dataset.available !== 'true' : false;
      button.removeAttribute('aria-busy');
    }
  };
}

if (!customElements.get('genetix-product')) customElements.define('genetix-product', GenetixProduct);
