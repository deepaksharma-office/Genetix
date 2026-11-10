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
    this.syncVariantState();
  }

  disconnectedCallback() {
    this.abortController?.abort();
    this.abortController = null;
  }

  onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-zoom-open]')) return this.querySelector('dialog')?.showModal();
    if (target.closest('[data-zoom-close]')) return this.querySelector('dialog')?.close();
    const thumb = target.closest('[data-media-src]');
    if (thumb instanceof HTMLElement) return this.updateMedia(thumb);
    const quantityButton = target.closest('[data-quantity-minus], [data-quantity-plus]');
    if (quantityButton) return this.updateQuantity(quantityButton.hasAttribute('data-quantity-plus') ? 1 : -1);
    const accordion = target.closest('[data-accordion-trigger]');
    if (accordion instanceof HTMLButtonElement) this.toggleAccordion(accordion);
  };

  onChange = (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.matches('[data-variant-select]')) this.syncVariantState();
  };

  get selectedVariant() {
    const select = this.querySelector('[data-variant-select]');
    return select instanceof HTMLSelectElement ? select.selectedOptions[0] : this.querySelector('[data-variant-id]');
  }

  syncVariantState() {
    const variant = this.selectedVariant;
    if (!(variant instanceof HTMLElement)) return;
    const shopifyAvailable = variant.dataset.available === 'true';
    const inventoryTracked = Boolean(variant.dataset.inventoryManagement);
    const inventoryQuantity = Number(variant.dataset.inventoryQuantity || 0);
    const inventoryPolicy = variant.dataset.inventoryPolicy || 'deny';
    const minimumQuantity = Number(variant.dataset.min || 1);
    const available = shopifyAvailable && (!inventoryTracked || inventoryPolicy === 'continue' || inventoryQuantity >= minimumQuantity);
    const price = variant.dataset.price || '';
    const formVariant = this.form?.querySelector('[data-form-variant]');
    if (formVariant instanceof HTMLInputElement) formVariant.value = variant.value;
    this.querySelectorAll('[data-price], [data-button-price]').forEach((element) => { element.textContent = price; });
    const compare = this.querySelector('[data-compare-price]');
    if (compare) {
      compare.textContent = variant.dataset.comparePrice || '';
      compare.classList.toggle('hidden', variant.dataset.hasCompare !== 'true');
    }
    for (const button of this.querySelectorAll('[data-product-submit]')) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.disabled = !available;
      const label = button.querySelector('[data-button-label]');
      const buttonPrice = button.querySelector('[data-button-price]');
      const baseLabel = button.dataset.baseLabel || this.dataset.addLabel || '';
      if (label) {
        label.childNodes[0].textContent = available ? baseLabel : this.dataset.soldOutLabel || '';
      }
      if (buttonPrice) buttonPrice.classList.toggle('hidden', !available);
    }
    const inventory = this.querySelector('[data-inventory-status]');
    if (inventory instanceof HTMLElement) {
      inventory.dataset.unavailable = String(!available);
      const label = inventory.querySelector('[data-inventory-label]');
      if (label) label.textContent = available ? inventory.dataset.availableLabel || '' : this.dataset.soldOutLabel || '';
    }
    const input = this.querySelector('[data-quantity-input]');
    if (input instanceof HTMLInputElement) {
      input.min = variant.dataset.min || '1';
      input.step = variant.dataset.step || '1';
      if (variant.dataset.max) input.max = variant.dataset.max;
      else input.removeAttribute('max');
      input.value = input.min;
    }
  }

  updateMedia(thumb) {
    const image = this.querySelector('[data-main-image]');
    if (image instanceof HTMLImageElement) { image.src = thumb.dataset.mediaSrc || ''; image.srcset = ''; image.alt = thumb.dataset.mediaAlt || ''; }
    const zoom = this.querySelector('[data-zoom-image]');
    if (zoom instanceof HTMLImageElement) { zoom.src = thumb.dataset.mediaSrc || ''; zoom.alt = thumb.dataset.mediaAlt || ''; }
    this.querySelectorAll('[data-media-src]').forEach((button) => button.setAttribute('aria-current', String(button === thumb)));
  }

  updateQuantity(direction) {
    const input = this.querySelector('[data-quantity-input]');
    if (!(input instanceof HTMLInputElement)) return;
    const min = Number(input.min) || 1;
    const max = input.max ? Number(input.max) : Infinity;
    const step = Number(input.step) || 1;
    input.value = String(Math.min(max, Math.max(min, (Number(input.value) || min) + direction * step)));
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

  onResize = () => {
    const trigger = this.querySelector('[data-accordion-trigger][aria-expanded="true"]');
    if (!(trigger instanceof HTMLButtonElement)) return;
    const panel = this.getAccordionPanel(trigger);
    if (panel) panel.style.height = `${panel.scrollHeight}px`;
  };

  onSubmit = async (event) => {
    event.preventDefault();
    if (this.pending || !this.form) return;
    const submitter = event.submitter;
    if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) return;
    const error = this.querySelector('[data-error]');
    const buttons = [...this.querySelectorAll('[data-product-submit]')].filter((button) => button instanceof HTMLButtonElement);
    const data = new FormData(this.form);
    const quantity = Number(data.get('quantity')) || 1;
    this.pending = true;
    buttons.forEach((button) => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
    if (error) error.textContent = '';
    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(new CartLinesUpdateEvent({ action: 'add', context: 'product', lines: [{ merchandiseId: String(data.get('id')), quantity }], promise: deferred.promise }));
    try {
      const sectionIds = Array.from(document.querySelectorAll('cart-items-component[data-section-id]'), (component) => component.dataset.sectionId).filter(Boolean);
      if (sectionIds.length) data.set('sections', [...new Set(sectionIds)].slice(0, 5).join(','));
      data.set('sections_url', window.location.pathname);
      const response = await fetch(Theme.routes.cart_add_url, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
      const added = await response.json();
      if (!response.ok || added.status) throw new Error(added.description || added.message || Theme.translations.add_to_cart_error);
      const cartResponse = await fetch(`${Theme.routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
      if (!cartResponse.ok) throw new Error(Theme.translations.add_to_cart_error);
      const cart = await cartResponse.json();
      deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart), detail: { items: cart.items, sections: added.sections, source: 'genetix-featured-product', sourceId: this.id, itemCount: quantity, didError: false } });
    } catch (exception) {
      if (error) error.textContent = exception instanceof Error ? exception.message : Theme.translations.add_to_cart_error;
      deferred.reject(exception);
    } finally {
      this.pending = false;
      buttons.forEach((button) => button.removeAttribute('aria-busy'));
      this.syncVariantState();
    }
  };
}

if (!customElements.get('genetix-product')) customElements.define('genetix-product', GenetixProduct);
