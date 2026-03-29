/**
 * Store SPA — публичный лайт-магазин на поддомене.
 * См. STORE_GITHUB_PAGES_PLAN.md
 *
 * Резолв поддомена:
 * location.hostname.split('.')[0] → storesBySubdomain/{subdomain} → ownerUid → store, storeProducts
 */

(function() {
    'use strict';

    // === КОНФИГУРАЦИЯ (тот же проект Firebase, что и Manager) ===
    const firebaseConfig = {
        apiKey: "AIzaSyAC1jhjIEncoLZyoVkPVPs9J1s-cVQeOV4",
        authDomain: "d-print-app-3655b.firebaseapp.com",
        projectId: "d-print-app-3655b",
        storageBucket: "d-print-app-3655b.firebasestorage.app",
        messagingSenderId: "691529808811",
        appId: "1:691529808811:web:a6aec2a47d85d55f41f0ee",
        measurementId: "G-FF384D3F8F",
        databaseURL: "https://d-print-app-3655b-default-rtdb.europe-west1.firebasedatabase.app"
    };

    // Поддомены, зарезервированные для приложения (план §5.5)
    const RESERVED_SUBDOMAINS = ['app', 'www', 'api', 'mail', 'admin', 'store'];

    const RU_TO_LAT = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
        'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
        'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
        'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    /** Транслитерация для сегмента URL товара (?tovar=...) */
    function transliterateRuForSlug(str) {
        const s = String(str || '').toLowerCase();
        let out = '';
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (RU_TO_LAT[ch] !== undefined) {
                out += RU_TO_LAT[ch];
                continue;
            }
            if (/[a-z0-9]/.test(ch)) {
                out += ch;
                continue;
            }
            if (/\s/.test(ch) || ch === '-' || ch === '_' || ch === '.') {
                out += '-';
            }
        }
        return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function slugifyProductName(name) {
        const t = transliterateRuForSlug(name);
        return t || '';
    }

    let _indexToTovarSlug = {};
    let _tovarSlugToIndex = {};

    function rebuildTovarSlugMaps() {
        _indexToTovarSlug = {};
        _tovarSlugToIndex = {};
        const arr = storeProductsData || [];
        const usage = {};
        for (let i = 0; i < arr.length; i++) {
            let base = slugifyProductName(arr[i] && arr[i].name);
            if (!base) base = 'tovar';
            usage[base] = (usage[base] || 0) + 1;
            const slug = usage[base] === 1 ? base : base + '-' + usage[base];
            _indexToTovarSlug[i] = slug;
            _tovarSlugToIndex[slug] = i;
        }
    }

    function getStoreQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    /** Собрать URL: pathname + ? + params (сохраняет store= на localhost) + hash */
    function buildStoreUrlWithSearch(updates) {
        const u = new URL(window.location.href);
        const params = u.searchParams;
        if (updates.tovar === null || updates.tovar === '') {
            params.delete('tovar');
        } else if (updates.tovar) {
            params.set('tovar', updates.tovar);
        }
        const q = params.toString();
        return u.pathname + (q ? '?' + q : '') + (u.hash || '');
    }

    function stripTovarFromUrlReplace() {
        if (!getStoreQueryParam('tovar')) return;
        try {
            history.replaceState(null, '', buildStoreUrlWithSearch({ tovar: null }));
        } catch (e) { /* IE */ }
    }

    function setTovarInUrlReplace(slug) {
        if (!slug) return;
        try {
            history.replaceState(null, '', buildStoreUrlWithSearch({ tovar: slug }));
        } catch (e) { /* IE */ }
    }

    function ensureHeadMeta(attrName, attrValue, keyTag) {
        const sel = `meta[${attrName}="${attrValue.replace(/"/g, '\\"')}"]`;
        let el = document.head.querySelector(sel);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attrName, attrValue);
            if (keyTag) el.setAttribute('data-store-seo', keyTag);
            document.head.appendChild(el);
        } else if (keyTag) el.setAttribute('data-store-seo', keyTag);
        return el;
    }

    function removeStoreSeoNodes() {
        document.querySelectorAll('[data-store-seo]').forEach((n) => n.remove());
    }

    function truncateSeoText(s, maxLen) {
        const t = String(s || '').replace(/\s+/g, ' ').trim();
        if (t.length <= maxLen) return t;
        return t.slice(0, maxLen - 1).trim() + '…';
    }

    function absoluteUrlMaybe(url) {
        const u = String(url || '').trim();
        if (!u) return '';
        if (/^https?:\/\//i.test(u)) return u;
        try {
            return new URL(u, window.location.origin).href;
        } catch (e) {
            return '';
        }
    }

    function stripHtmlToText(html) {
        const d = document.createElement('div');
        d.innerHTML = String(html || '');
        return (d.textContent || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Метатег подтверждения домена для Яндекс Метрики (users/…/store.yandexVerificationMeta).
     * Принимает полный &lt;meta name="yandex-verification" …&gt; или только значение content.
     */
    function injectStoreYandexVerificationMeta(snippet) {
        document.querySelectorAll('meta[data-store-yandex-verification="1"]').forEach(function(el) {
            el.remove();
        });
        if (document.querySelector('meta[name="yandex-verification"]')) {
            return;
        }
        const raw = String(snippet || '').trim();
        if (!raw) return;

        let sourceMeta = null;
        if (raw.indexOf('<') !== -1) {
            try {
                const doc = new DOMParser().parseFromString(raw, 'text/html');
                const metas = doc.querySelectorAll('meta');
                for (let i = 0; i < metas.length; i++) {
                    const n = (metas[i].getAttribute('name') || '').toLowerCase();
                    if (n === 'yandex-verification') {
                        sourceMeta = metas[i];
                        break;
                    }
                }
            } catch (e) { /* ignore */ }
            if (!sourceMeta) return;
            const meta = document.createElement('meta');
            for (let j = 0; j < sourceMeta.attributes.length; j++) {
                const a = sourceMeta.attributes[j];
                meta.setAttribute(a.name, a.value);
            }
            meta.setAttribute('data-store-yandex-verification', '1');
            document.head.appendChild(meta);
            return;
        }

        const content = raw.replace(/^["']|["']$/g, '').trim();
        if (!content) return;
        const meta = document.createElement('meta');
        meta.setAttribute('data-store-yandex-verification', '1');
        meta.setAttribute('name', 'yandex-verification');
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
    }

    /**
     * Вставка кода Яндекс Метрики из настроек магазина (users/…/store.yandexMetricaSnippet).
     * Удаляет предыдущие вставки по маркеру data-store-yandex-metrica.
     */
    function injectStoreYandexMetrica(snippet) {
        document.querySelectorAll('[data-store-yandex-metrica="1"]').forEach(function(el) {
            el.remove();
        });
        const raw = String(snippet || '').trim();
        if (!raw) return;

        let doc;
        try {
            doc = new DOMParser().parseFromString(raw, 'text/html');
        } catch (e) {
            return;
        }
        const scripts = doc.querySelectorAll('script');
        const noscripts = doc.querySelectorAll('noscript');

        scripts.forEach(function(old) {
            const scr = document.createElement('script');
            scr.setAttribute('data-store-yandex-metrica', '1');
            for (let i = 0; i < old.attributes.length; i++) {
                const a = old.attributes[i];
                scr.setAttribute(a.name, a.value);
            }
            if (old.src) {
                scr.src = old.src;
            } else {
                scr.textContent = old.textContent || '';
            }
            document.head.appendChild(scr);
        });

        noscripts.forEach(function(ns) {
            const clone = document.createElement('noscript');
            clone.setAttribute('data-store-yandex-metrica', '1');
            clone.innerHTML = ns.innerHTML;
            document.body.appendChild(clone);
        });
    }

    function removeJsonLdScript() {
        document.querySelectorAll('script[data-store-seo="jsonld"]').forEach((n) => n.remove());
    }

    function applyJsonLdWebSite() {
        const cfg = storeConfig || {};
        const pageTitle = (cfg.seoTitle || cfg.title || 'Магазин').trim() || 'Магазин';
        const desc = truncateSeoText(
            cfg.seoDescription || cfg.description || cfg.aboutDesc || '',
            300
        );
        const siteUrl = hrefWithoutTovarQuery();
        const ld = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: pageTitle,
            description: desc || undefined,
            url: siteUrl
        };
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-store-seo', 'jsonld');
        script.textContent = JSON.stringify(ld);
        document.head.appendChild(script);
    }

    function applyJsonLdProduct(p) {
        if (!p) return;
        const name = (p.name || 'Товар').trim();
        const desc = truncateSeoText(stripHtmlToText(p.description) || name, 300);
        const imgs = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls : (p.imageUrl ? [p.imageUrl] : []);
        const img0 = imgs.length ? absoluteUrlMaybe(imgs[0]) : '';
        const price = parseFloat(p.priceSale || p.price) || 0;
        const currency = 'RUB';
        const ld = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name,
            description: desc || undefined,
            image: img0 || undefined,
            offers: {
                '@type': 'Offer',
                price: price.toFixed(2),
                priceCurrency: currency,
                availability: 'https://schema.org/InStock'
            }
        };
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-store-seo', 'jsonld');
        script.textContent = JSON.stringify(ld);
        document.head.appendChild(script);
    }

    /**
     * SEO для главной витрины (без открытой модалки товара)
     */
    function hrefWithoutTovarQuery() {
        try {
            const u = new URL(window.location.href);
            u.searchParams.delete('tovar');
            u.hash = '';
            return u.origin + u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
        } catch (e) {
            return window.location.href.split('#')[0];
        }
    }

    function hrefCurrentPageNoHash() {
        try {
            const u = new URL(window.location.href);
            u.hash = '';
            return u.href;
        } catch (e) {
            return window.location.href.split('#')[0];
        }
    }

    function applySeoForStoreHome() {
        const cfg = storeConfig || {};
        const pageTitle = (cfg.seoTitle || cfg.title || 'Магазин').trim() || 'Магазин';
        document.title = pageTitle;

        removeStoreSeoNodes();
        removeJsonLdScript();

        const rawDesc = (cfg.seoDescription || cfg.description || cfg.aboutDesc || '').trim();
        const desc = truncateSeoText(stripHtmlToText(rawDesc) || pageTitle, 160);
        const dm = ensureHeadMeta('name', 'description', 'desc');
        dm.setAttribute('content', desc);

        const canonicalHref = hrefWithoutTovarQuery();
        let link = document.head.querySelector('link[rel="canonical"][data-store-seo="canonical"]');
        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'canonical');
            link.setAttribute('data-store-seo', 'canonical');
            document.head.appendChild(link);
        }
        link.setAttribute('href', canonicalHref);

        const ogTitle = ensureHeadMeta('property', 'og:title', 'og-title');
        ogTitle.setAttribute('content', pageTitle);
        const ogDesc = ensureHeadMeta('property', 'og:description', 'og-desc');
        ogDesc.setAttribute('content', desc);
        const ogUrl = ensureHeadMeta('property', 'og:url', 'og-url');
        ogUrl.setAttribute('content', canonicalHref);
        const ogType = ensureHeadMeta('property', 'og:type', 'og-type');
        ogType.setAttribute('content', 'website');
        const twCard = ensureHeadMeta('name', 'twitter:card', 'tw-card');
        twCard.setAttribute('content', 'summary_large_image');

        const ogImgUrl = absoluteUrlMaybe(cfg.seoOgImage || cfg.logo || cfg.banner || '');
        if (ogImgUrl) {
            const ogImg = ensureHeadMeta('property', 'og:image', 'og-image');
            ogImg.setAttribute('content', ogImgUrl);
        }

        if (cfg.seoNoindex) {
            const robots = ensureHeadMeta('name', 'robots', 'robots');
            robots.setAttribute('content', 'noindex, nofollow');
        }

        applyJsonLdWebSite();
    }

    /**
     * SEO при открытой карточке товара
     */
    function applySeoForProductModal(p) {
        if (!p) return;
        const cfg = storeConfig || {};
        const shopName = (cfg.seoTitle || cfg.title || 'Магазин').trim() || 'Магазин';
        const name = (p.name || 'Товар').trim();
        document.title = truncateSeoText(name + ' — ' + shopName, 70);

        removeStoreSeoNodes();
        removeJsonLdScript();

        const rawPd = stripHtmlToText(p.description);
        const desc = truncateSeoText(rawPd || name, 160);
        const dm = ensureHeadMeta('name', 'description', 'desc');
        dm.setAttribute('content', desc);

        const pageUrl = hrefCurrentPageNoHash();
        let link = document.head.querySelector('link[rel="canonical"][data-store-seo="canonical"]');
        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'canonical');
            link.setAttribute('data-store-seo', 'canonical');
            document.head.appendChild(link);
        }
        link.setAttribute('href', pageUrl);

        const ogTitle = ensureHeadMeta('property', 'og:title', 'og-title');
        ogTitle.setAttribute('content', name);
        const ogDesc = ensureHeadMeta('property', 'og:description', 'og-desc');
        ogDesc.setAttribute('content', desc);
        const ogUrl = ensureHeadMeta('property', 'og:url', 'og-url');
        ogUrl.setAttribute('content', pageUrl);
        const ogType = ensureHeadMeta('property', 'og:type', 'og-type');
        ogType.setAttribute('content', 'product');

        const imgs = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls : (p.imageUrl ? [p.imageUrl] : []);
        const img0 = imgs.length ? absoluteUrlMaybe(imgs[0]) : '';
        const ogImgFallback = absoluteUrlMaybe(cfg.seoOgImage || cfg.logo || cfg.banner || '');
        const ogImgFinal = img0 || ogImgFallback;
        if (ogImgFinal) {
            const ogImg = ensureHeadMeta('property', 'og:image', 'og-image');
            ogImg.setAttribute('content', ogImgFinal);
        }

        if (cfg.seoNoindex) {
            const robots = ensureHeadMeta('name', 'robots', 'robots');
            robots.setAttribute('content', 'noindex, nofollow');
        }

        applyJsonLdProduct(p);
    }

    /**
     * Определяет поддомен по hostname.
     * app.my-3d-print.ru → Manager (не Store)
     * test-shop.my-3d-print.ru → "test-shop"
     * localhost / 127.0.0.1 → для dev-режима поддержка ?store=subdomain
     */
    function getSubdomain() {
        const hostname = window.location.hostname;
        const params = new URLSearchParams(window.location.search);

        // Dev: ?store=test-shop или #store=test-shop (hash переживает редирект 301)
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            const fromQuery = params.get('store');
            if (fromQuery) return fromQuery;
            const hash = location.hash.replace(/^#/, '');
            const hashParams = new URLSearchParams(hash);
            return hashParams.get('store') || null;
        }

        const parts = hostname.split('.');
        // Нужно минимум 3 части: subdomain.domain.tld
        if (parts.length < 3) return null;

        const sub = parts[0].toLowerCase();
        if (!sub || RESERVED_SUBDOMAINS.includes(sub)) return null;
        return sub;
    }

    /**
     * Проверка: текущий host — Store (поддомен) или Manager (app)?
     */
    function isStoreHost() {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return !!new URLSearchParams(window.location.search).get('store');
        }
        const parts = hostname.split('.');
        if (parts.length < 3) return false;
        return !RESERVED_SUBDOMAINS.includes(parts[0].toLowerCase());
    }

    /**
     * Показ состояния: загрузка / не найден / каталог / корзина
     */
    function showState(state, options) {
        const loading = document.getElementById('storeLoading');
        const notFound = document.getElementById('storeNotFound');
        const cartPage = document.getElementById('storeCartPage');
        const loadingText = document.getElementById('storeLoadingText');
        const notFoundReason = document.getElementById('storeNotFoundReason');

        loading.classList.add('hidden');
        notFound.classList.add('hidden');
        const mainPage = document.getElementById('storeMainPage');
        const categoryPage = document.getElementById('storeCategoryPage');
        const favoritesPage = document.getElementById('storeFavoritesPage');
        const accountPage = document.getElementById('storeAccountPage');
        if (mainPage) mainPage.classList.add('hidden');
        if (categoryPage) categoryPage.classList.add('hidden');
        if (favoritesPage) favoritesPage.classList.add('hidden');
        if (accountPage) accountPage.classList.add('hidden');
        if (cartPage) cartPage.classList.add('hidden');

        const hamburger = document.getElementById('storeHamburgerBtn');
        if (hamburger) hamburger.classList.add('hidden');
        document.getElementById('storeSearchWrap')?.classList.add('hidden');

        if (state === 'loading') {
            loading.classList.remove('hidden');
            if (options && options.message) loadingText.textContent = options.message;
            updateStoreBanner();
        } else if (state === 'notFound') {
            notFound.classList.remove('hidden');
            if (options && options.reason) notFoundReason.textContent = options.reason;
            updateStoreBanner();
        } else if (state === 'main') {
            if (mainPage) mainPage.classList.remove('hidden');
            if (hamburger) hamburger.classList.remove('hidden');
            document.getElementById('storeSearchWrap')?.classList.remove('hidden');
            updateStoreBanner();
        } else if (state === 'category') {
            if (categoryPage) categoryPage.classList.remove('hidden');
            if (hamburger) hamburger.classList.remove('hidden');
            document.getElementById('storeSearchWrap')?.classList.remove('hidden');
            updateStoreBanner();
        } else if (state === 'favorites' && favoritesPage) {
            favoritesPage.classList.remove('hidden');
            if (hamburger) hamburger.classList.remove('hidden');
            document.getElementById('storeSearchWrap')?.classList.remove('hidden');
            updateStoreBanner();
        } else if (state === 'account' && accountPage) {
            accountPage.classList.remove('hidden');
            if (hamburger) hamburger.classList.remove('hidden');
            document.getElementById('storeSearchWrap')?.classList.remove('hidden');
            renderAccountPage();
            updateStoreBanner();
        } else if (state === 'cart' && cartPage) {
            cartPage.classList.remove('hidden');
            if (hamburger) hamburger.classList.remove('hidden');
            document.getElementById('storeSearchWrap')?.classList.remove('hidden');
            updateStoreBanner();
        } else {
            updateStoreBanner();
        }
    }

    /**
     * Роутинг по hash: '' | cart | favorites | category/{id}
     */
    function getRoute() {
        const hash = (location.hash || '').replace(/^#/, '').replace(/\/$/, '').split('/');
        if (hash[0] === 'cart') return { type: 'cart' };
        if (hash[0] === 'favorites') return { type: 'favorites' };
        if (hash[0] === 'account') return { type: 'account' };
        if (hash[0] === 'category' && hash[1]) return { type: 'category', categoryId: hash[1] };
        return { type: 'main' };
    }

    function applyRoute() {
        closeCartDrawer();
        const route = getRoute();
        const routesThatClearTovar = ['cart', 'favorites', 'account', 'category'];
        if (routesThatClearTovar.includes(route.type)) {
            const modal = document.getElementById('storeProductModal');
            if (modal && !modal.classList.contains('hidden')) {
                closeProductImageFullscreen();
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
            stripTovarFromUrlReplace();
            if (storeConfig) applySeoForStoreHome();
        }
        if (route.type === 'cart' && storeOwnerUid) {
            showState('cart');
            renderCartPage();
        } else if (route.type === 'account' && storeOwnerUid) {
            const user = firebase.auth().currentUser;
            if (user) {
                showState('account');
                renderAccountPage();
                renderCategoriesDrawer();
            } else {
                const auth = firebase.auth();
                const readyPromise = auth.authStateReady ? auth.authStateReady() : new Promise(resolve => {
                    const unsub = auth.onAuthStateChanged(() => { unsub(); resolve(); });
                });
                readyPromise.then(() => {
                    const u = firebase.auth().currentUser;
                    if (u) {
                        showState('account');
                        renderAccountPage();
                        renderCategoriesDrawer();
                    } else {
                        openStoreAuthModal();
                        location.hash = '';
                        applyRoute();
                    }
                });
            }
        } else if (route.type === 'favorites' && storeOwnerUid) {
            showState('favorites');
            renderFavoritesPage();
            renderCategoriesDrawer();
        } else if (storeOwnerUid) {
            if (route.type === 'category') {
                _selectedCategoryId = route.categoryId;
                showState('category');
                renderCategoryPage();
            } else {
                _selectedCategoryId = null;
                showState('main');
                renderMainPage();
            }
            renderCategoriesDrawer();
        }
    }

    /**
     * Обновление баннера (между шапкой и контентом)
     */
    function updateStoreBanner() {
        const bannerEl = document.getElementById('storeBanner');
        const bannerImg = document.getElementById('storeBannerImg');
        const bannerDesc = document.getElementById('storeBannerDesc');
        if (!bannerEl || !bannerImg) return;
        const showBanner = storeConfig && storeConfig.banner && getRoute().type === 'main';
        if (showBanner) {
            bannerImg.src = storeConfig.banner;
            bannerEl.classList.remove('hidden');
            if (bannerDesc) {
                const desc = storeConfig.aboutDesc || '';
                bannerDesc.textContent = desc;
                bannerDesc.classList.toggle('hidden', !desc);
            }
        } else {
            bannerEl.classList.add('hidden');
            bannerImg.src = '';
            if (bannerDesc) bannerDesc.textContent = '';
        }
    }

    /**
     * Обновление шапки (из настроек магазина)
     */
    function updateHeader(title, description) {
        const titleEl = document.getElementById('storeTitle');
        const descEl = document.getElementById('storeDescription');
        const logoImg = document.getElementById('storeLogoImg');
        const logoLink = document.getElementById('storeLogoLink');
        const logo = storeConfig && storeConfig.logo;
        if (logo) {
            if (logoImg) { logoImg.src = logo; logoImg.alt = title || 'Логотип'; logoImg.classList.remove('hidden'); }
            if (titleEl) titleEl.classList.add('hidden');
            if (descEl) descEl.classList.add('hidden');
        } else {
            if (logoImg) { logoImg.src = ''; logoImg.classList.add('hidden'); }
            if (titleEl) { titleEl.textContent = title || 'Магазин'; titleEl.classList.remove('hidden'); }
            if (descEl) { descEl.textContent = description || ''; descEl.classList.remove('hidden'); }
        }
        if (logoLink) logoLink.href = storeOwnerUid ? '#' : '#';
    }

    /**
     * Применение цветов шапки и подвала из настроек магазина
     */
    function applyStoreThemeColors() {
        const headerEl = document.getElementById('storeHeader');
        const footerEl = document.getElementById('storeFooter');
        if (headerEl && storeConfig && storeConfig.headerColor) {
            headerEl.style.backgroundColor = storeConfig.headerColor;
        } else if (headerEl) {
            headerEl.style.backgroundColor = '';
        }
        if (footerEl && storeConfig && storeConfig.footerColor) {
            footerEl.style.backgroundColor = storeConfig.footerColor;
        } else if (footerEl) {
            footerEl.style.backgroundColor = '';
        }
        const headingColor = storeConfig && storeConfig.headingColor ? String(storeConfig.headingColor) : '#1e293b';
        const hc = headingColor.startsWith('#') ? headingColor : '#' + headingColor;
        document.documentElement.style.setProperty('--store-heading-color', hc);
        let bannerDescTc = (storeConfig && storeConfig.bannerDescTextColor) ? String(storeConfig.bannerDescTextColor) : hc;
        if (bannerDescTc && !bannerDescTc.startsWith('#')) bannerDescTc = '#' + bannerDescTc;
        document.documentElement.style.setProperty('--store-banner-desc-text-color', bannerDescTc);
    }

    /**
     * Фон секции с табами (настройка «Цвет секции с табами») + устаревшие CSS-переменные свимлайнов
     */
    function applyStoreSwimlaneColor() {
        let tabsBg = storeConfig && (storeConfig.tabsSectionColor || storeConfig.swimlaneNewColor || storeConfig.swimlaneColor)
            ? String(storeConfig.tabsSectionColor || storeConfig.swimlaneNewColor || storeConfig.swimlaneColor)
            : '#e0f2fe';
        if (tabsBg && !tabsBg.startsWith('#')) tabsBg = '#' + tabsBg;
        document.documentElement.style.setProperty('--store-tabs-section-bg', tabsBg);
        document.documentElement.style.setProperty('--store-swimlane-new-color', tabsBg);
        document.documentElement.style.setProperty('--store-swimlane-popular-color', tabsBg);
    }

    /**
     * Применение цвета кнопки "Добавить в корзину"
     */
    function applyAddToCartButtonColor() {
        let color = storeConfig && storeConfig.addToCartButtonColor ? String(storeConfig.addToCartButtonColor) : '#2563eb';
        if (color && !color.startsWith('#')) color = '#' + color;
        const textColor = storeConfig && storeConfig.addToCartButtonTextWhite === false ? '#1e293b' : 'white';
        document.documentElement.style.setProperty('--store-add-to-cart-color', color);
        document.documentElement.style.setProperty('--store-add-to-cart-text-color', textColor);
        let styleEl = document.getElementById('store-add-to-cart-dynamic-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'store-add-to-cart-dynamic-style';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            .store-card-add, .store-product-modal-add, .store-cart-drawer-to-page,
            .store-checkout-btn, .store-checkout-submit-btn,
            .store-category-drawer-item.active,
            .store-auth-form .btn-primary {
                background-color: ${color} !important;
                color: ${textColor} !important;
            }
        `;
    }

    function buildCategoriesMap(nodes) {
        const map = {};
        (nodes || []).forEach(n => {
            map[n.id] = { name: n.name || '', parentId: n.parentId || null };
            if (n.children?.length) Object.assign(map, buildCategoriesMap(n.children));
        });
        return map;
    }

    // Загруженные данные магазина (ownerUid, store config, storeProducts, storeCategories)
    let storeOwnerUid = null;
    let storeConfig = null;
    let storeProductsData = null;
    let storeCategoriesData = null;
    let storeCategoriesMap = {};
    let storeSubdomain = null;
    let _selectedCategoryId = null;
    let _storeSearchTerm = '';

    /** Витрина и корзина: скрыты выключенные из каталога и неактивные товары */
    function isStoreProductVisibleOnStorefront(p) {
        if (!p) return false;
        if (p.inCatalog === false) return false;
        if (p.active === false) return false;
        return true;
    }

    /**
     * Корзина — ключ localStorage по поддомену
     */
    function getCartStorageKey() {
        return storeSubdomain ? 'store_cart_' + storeSubdomain : 'store_cart';
    }

    /**
     * Избранное — ключ localStorage по поддомену (работает и для незарегистрированных)
     */
    function getFavoritesStorageKey() {
        return storeSubdomain ? 'store_favorites_' + storeSubdomain : 'store_favorites';
    }

    function getFavorites() {
        try {
            const raw = localStorage.getItem(getFavoritesStorageKey());
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function setFavorites(arr) {
        localStorage.setItem(getFavoritesStorageKey(), JSON.stringify(arr));
        updateFavoritesUI();
    }

    function updateFavoritesUI() {
        const fav = getFavorites();
        const count = fav.length;
        const countEl = document.getElementById('storeFavoritesCount');
        const btn = document.getElementById('storeFavoritesBtn');
        if (countEl) countEl.textContent = count;
        if (btn) {
            btn.classList.toggle('hidden', !storeOwnerUid);
            btn.classList.toggle('store-favorites-btn--has-items', count > 0);
        }
        refreshFavButtons();
        if (getRoute().type === 'favorites') renderFavoritesPage();
    }

    function isFavorite(productIndex) {
        return getFavorites().includes(productIndex);
    }

    function toggleFavorite(productIndex, e) {
        if (e) e.stopPropagation();
        const fav = getFavorites();
        const idx = fav.indexOf(productIndex);
        if (idx >= 0) fav.splice(idx, 1);
        else fav.push(productIndex);
        setFavorites(fav);
    }

    function refreshFavButtons() {
        const favSet = new Set(getFavorites());
        document.querySelectorAll('.store-card-fav').forEach(btn => {
            const idx = parseInt(btn.dataset.index, 10);
            const isFav = favSet.has(idx);
            btn.classList.toggle('active', isFav);
            btn.title = isFav ? 'Убрать из избранного' : 'Добавить в избранное';
        });
        const modalFav = document.getElementById('storeProductModalFavBtn');
        if (modalFav && modalFav.dataset.index) {
            const idx = parseInt(modalFav.dataset.index, 10);
            const isFav = favSet.has(idx);
            modalFav.classList.toggle('active', isFav);
            modalFav.title = isFav ? 'Убрать из избранного' : 'Добавить в избранное';
        }
    }

    function getCart() {
        try {
            const raw = localStorage.getItem(getCartStorageKey());
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function setCart(items) {
        const key = getCartStorageKey();
        localStorage.setItem(key, JSON.stringify(items));
        updateCartUI();
    }

    function addToCart(productIndex, qty) {
        const p = storeProductsData[productIndex];
        if (!p || !isStoreProductVisibleOnStorefront(p)) return;
        const priceSaleVal = (p.priceSale != null && p.priceSale !== '') ? parseFloat(p.priceSale) : null;
        const effectivePrice = (priceSaleVal != null && priceSaleVal > 0) ? priceSaleVal : (parseFloat(p.price) || 0);
        const items = getCart();
        const idx = items.findIndex(x => x.productIndex === productIndex);
        const addQty = qty || 1;
        if (idx >= 0) {
            items[idx].qty += addQty;
        } else {
            const urls = Array.isArray(p.imageUrls) ? p.imageUrls : [];
            const imgUrl = urls[0] || p.imageUrl || '';
            items.push({
                productIndex,
                name: p.name || 'Товар',
                price: effectivePrice,
                productId: p.productId || null,
                qty: addQty,
                imageUrl: imgUrl
            });
        }
        setCart(items);
    }

    function updateCartQty(productIndex, delta) {
        const items = getCart();
        const idx = items.findIndex(x => x.productIndex === productIndex);
        if (idx < 0) return;
        items[idx].qty += delta;
        if (items[idx].qty <= 0) items.splice(idx, 1);
        setCart(items);
    }

    function removeFromCart(productIndex) {
        const items = getCart().filter(x => x.productIndex !== productIndex);
        setCart(items);
    }

    function getCartTotal() {
        return getCart().reduce((s, x) => s + x.price * x.qty, 0);
    }

    /**
     * Подсказка в модалке товара: сколько уже в корзине (обновлять при открытии и после setCart).
     */
    function refreshStoreProductModalCartHint(productIndex) {
        const wrap = document.getElementById('storeProductModalCartHint');
        const textEl = document.getElementById('storeProductModalCartHintText');
        if (!wrap || !textEl) return;
        const idx = typeof productIndex === 'number' && !Number.isNaN(productIndex) ? productIndex : _productModalCurrentIdx;
        const line = getCart().find((x) => x.productIndex === idx);
        const q = line ? line.qty : 0;
        if (q <= 0) {
            wrap.classList.add('hidden');
            textEl.textContent = '';
            return;
        }
        wrap.classList.remove('hidden');
        textEl.textContent = q === 1 ? 'В корзине: 1 шт.' : `В корзине: ${q} шт.`;
    }

    function clearCart() {
        setCart([]);
    }

    /**
     * Обновление UI корзины: иконка, drawer, страница
     */
    function updateCartUI() {
        const items = getCart();
        const total = getCartTotal();
        const count = items.reduce((s, x) => s + x.qty, 0);

        const btn = document.getElementById('storeCartBtn');
        const countEl = document.getElementById('storeCartCount');
        if (btn) {
            btn.classList.toggle('hidden', !storeOwnerUid);
            btn.classList.toggle('store-cart-btn--has-items', count > 0);
        }
        if (countEl) countEl.textContent = count;

        // Drawer
        const drawerList = document.getElementById('storeCartDrawerList');
        const drawerEmpty = document.getElementById('storeCartDrawerEmpty');
        const drawerFooter = document.getElementById('storeCartDrawerFooter');
        const drawerTotalVal = document.getElementById('storeCartDrawerTotalVal');
        if (drawerList) drawerList.innerHTML = renderCartItemsHtml(items, true);
        if (drawerEmpty) drawerEmpty.classList.toggle('hidden', items.length > 0);
        if (drawerFooter) drawerFooter.classList.toggle('hidden', items.length === 0);
        if (drawerTotalVal) drawerTotalVal.textContent = total.toFixed(0);

        // Страница /cart
        if (getRoute().type === 'cart') renderCartPage();

        const productModal = document.getElementById('storeProductModal');
        if (productModal && !productModal.classList.contains('hidden')) {
            refreshStoreProductModalCartHint();
        }
    }

    function renderCartItemsHtml(items, isDrawer) {
        return items.map(x => {
            const imgUrl = x.imageUrl || (storeProductsData && storeProductsData[x.productIndex] && (storeProductsData[x.productIndex].imageUrls?.[0] || storeProductsData[x.productIndex].imageUrl)) || '';
            const imgAttr = imgUrl ? ` data-image-url="${escapeStoreHtml(imgUrl)}"` : '';
            const previewHtml = imgUrl ? `<span class="store-cart-item-preview"><img src="${escapeStoreHtml(imgUrl)}" alt=""></span>` : '';
            return `
                <div class="store-cart-item" data-product-index="${x.productIndex}">
                    <div class="store-cart-item-name store-cart-item-name-clickable"${imgAttr} data-product-index="${x.productIndex}">${escapeStoreHtml(x.name)}${previewHtml}</div>
                    <div class="store-cart-item-qty">
                        <button type="button" class="store-cart-qty-btn" data-action="minus" data-index="${x.productIndex}" aria-label="Уменьшить">−</button>
                        <span class="store-cart-qty-val">${x.qty}</span>
                        <button type="button" class="store-cart-qty-btn" data-action="plus" data-index="${x.productIndex}" aria-label="Увеличить">+</button>
                    </div>
                    <div class="store-cart-item-price">${(x.price).toFixed(0)} ₽</div>
                    <div class="store-cart-item-sum">${(x.price * x.qty).toFixed(0)} ₽</div>
                    <button type="button" class="store-cart-item-remove" data-index="${x.productIndex}" aria-label="Удалить">&times;</button>
                </div>`;
        }).join('');
    }

    function escapeStoreHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    async function getStoreCategoriesTree(uid) {
        try {
            const snap = await firebase.database().ref('users/' + uid + '/storeCategories').once('value');
            const raw = snap.val();
            if (!raw || typeof raw !== 'object') return [];
            const flat = Object.entries(raw).map(([id, c]) => ({ id, ...c })).filter(c => !c.disabled);
            const byId = {};
            flat.forEach(c => { byId[c.id] = { ...c, children: [] }; });
            const roots = [];
            flat.forEach(c => {
                const node = byId[c.id];
                if (!c.parentId) roots.push(node);
                else if (byId[c.parentId]) byId[c.parentId].children.push(node);
                else roots.push(node);
            });
            roots.sort((a, b) => (a.order || 0) - (b.order || 0));
            const sortChildren = (nodes) => { nodes.forEach(n => { n.children.sort((a, b) => (a.order || 0) - (b.order || 0)); sortChildren(n.children); }); };
            sortChildren(roots);
            return roots;
        } catch (e) {
            console.warn('[Store] storeCategories load failed:', e);
            return [];
        }
    }

    function openCategoriesDrawer() {
        const drawer = document.getElementById('storeCategoriesDrawer');
        if (drawer) drawer.classList.add('store-categories-drawer--open');
    }

    function closeCategoriesDrawer() {
        const drawer = document.getElementById('storeCategoriesDrawer');
        if (drawer) drawer.classList.remove('store-categories-drawer--open');
    }

    function selectCategory(categoryId) {
        closeCategoriesDrawer();
        location.hash = categoryId ? 'category/' + categoryId : '';
    }

    function renderCategoriesDrawer() {
        const listEl = document.getElementById('storeCategoriesDrawerList');
        if (!listEl) return;
        const renderNode = (node, isSub) => {
            const cls = 'store-category-drawer-item' + (isSub ? ' store-category-drawer-sub' : '') + (_selectedCategoryId === node.id ? ' active' : '');
            const href = '#category/' + encodeURIComponent(node.id);
            let html = `<a href="${href}" class="${cls}" data-category-id="${escapeStoreHtml(node.id)}">${escapeStoreHtml(node.name || '')}</a>`;
            if (node.children && node.children.length) {
                node.children.forEach(c => { html += renderNode(c, true); });
            }
            return html;
        };
        const allCls = 'store-category-drawer-item' + (!_selectedCategoryId ? ' active' : '');
        let html = `<a href="#" class="${allCls}" data-category-id="">Все категории</a>`;
        if (storeCategoriesData && storeCategoriesData.length) {
            html += storeCategoriesData.map(n => renderNode(n, false)).join('');
        }
        listEl.innerHTML = html;
        listEl.querySelectorAll('.store-category-drawer-item').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                selectCategory(a.dataset.categoryId || null);
            });
        });
    }

    function getBreadcrumbs(categoryId) {
        const path = [];
        let id = categoryId;
        while (id && storeCategoriesMap[id]) {
            path.unshift({ id, name: storeCategoriesMap[id].name });
            id = storeCategoriesMap[id].parentId;
        }
        return path;
    }

    function buildProductCardHtml(p) {
        const idx = p._origIdx;
        const urls = Array.isArray(p.imageUrls) ? p.imageUrls : [];
        const imgUrl = urls[0] || p.imageUrl || '';
        const imgHtml = imgUrl
            ? `<img src="${escapeStoreHtml(imgUrl)}" alt="" class="store-card-img">`
            : '<div class="store-card-placeholder">📦</div>';
        const priceVal = parseFloat(p.price) || 0;
        const priceSaleVal = (p.priceSale != null && p.priceSale !== '') ? parseFloat(p.priceSale) : null;
        const hasDiscount = priceSaleVal != null && priceSaleVal > 0 && priceVal > priceSaleVal;
        const priceHtml = hasDiscount
            ? `<span class="store-card-price-old">${priceVal.toFixed(0)} ₽</span><span class="store-card-price store-card-price-sale">${priceSaleVal.toFixed(0)} ₽</span>`
            : `<span class="store-card-price">${priceVal.toFixed(0)} ₽</span>`;
        const descHtml = p.description
            ? `<p class="store-card-desc">${escapeStoreHtml(String(p.description).slice(0, 100))}${String(p.description).length > 100 ? '…' : ''}</p>`
            : '<div class="store-card-spacer"></div>';
        const fav = isFavorite(idx);
        const favBtn = `<button type="button" class="store-card-fav ${fav ? 'active' : ''}" data-index="${idx}" title="${fav ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-label="Избранное"></button>`;
        const newBadge = p.isNew ? '<span class="store-card-badge store-card-badge-new">Новинка</span>' : '';
        const popularBadge = p.isPopular ? '<span class="store-card-badge store-card-badge-popular">Популярный</span>' : '';
        const discountPct = (hasDiscount && priceVal > 0) ? Math.round((1 - priceSaleVal / priceVal) * 100) : 0;
        const discountBadge = (priceSaleVal != null && priceSaleVal > 0 && priceVal > priceSaleVal)
            ? '<span class="store-card-badge store-card-badge-discount">Скидка ' + discountPct + '%</span>' : '';
        return `
            <article class="store-card" data-product-index="${idx}">
                <div class="store-card-media-wrap">
                    <div class="store-card-media store-card-media-clickable" data-product-index="${idx}">${imgHtml}</div>
                    ${newBadge}${popularBadge}${discountBadge}${favBtn}
                </div>
                <div class="store-card-body">
                    <h3 class="store-card-title store-card-title-clickable" data-product-index="${idx}">${escapeStoreHtml(p.name || 'Товар')}</h3>
                    <div class="store-card-desc-area">${descHtml}</div>
                    <div class="store-card-bottom">
                        <div class="store-card-price-wrap">${priceHtml}</div>
                        <button type="button" class="btn-primary store-card-add" data-index="${idx}">Добавить в корзину</button>
                    </div>
                </div>
            </article>`;
    }

    function bindProductCardEvents(container) {
        if (!container) return;
        container.querySelectorAll('.store-card-add').forEach(btn => {
            if (btn.dataset.storeBound === '1') return;
            btn.dataset.storeBound = '1';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (!Number.isNaN(idx)) {
                    addToCart(idx);
                }
                // Лёгкая анимация отклика
                btn.classList.add('store-card-add--pulse');
                setTimeout(() => {
                    btn.classList.remove('store-card-add--pulse');
                }, 260);
            });
        });
        container.querySelectorAll('.store-card-fav').forEach(btn => {
            if (btn.dataset.storeBound === '1') return;
            btn.dataset.storeBound = '1';
            btn.addEventListener('click', (e) => toggleFavorite(parseInt(btn.dataset.index), e));
        });
        container.querySelectorAll('.store-card-media-clickable, .store-card-title-clickable').forEach(el => {
            if (el.dataset.storeBound === '1') return;
            el.dataset.storeBound = '1';
            el.addEventListener('click', () => openProductModal(parseInt(el.dataset.productIndex)));
        });
    }

    function filterBySearch(products) {
        const term = _storeSearchTerm.toLowerCase().trim();
        if (!term) return products;
        return products.filter(p => {
            const name = (p.name || '').toLowerCase();
            const desc = (p.description || '').toLowerCase();
            const sysId = (p.systemId || '').toLowerCase();
            return name.includes(term) || desc.includes(term) || sysId.includes(term);
        });
    }

    function renderMainPage() {
        const mainEl = document.getElementById('storeMainPage');
        if (!mainEl) return;

        const all = storeProductsData || [];
        let products = all.map((p, idx) => ({ ...p, _origIdx: idx })).filter(p => isStoreProductVisibleOnStorefront(p));
        products = filterBySearch(products);
        const newProducts = products.filter(p => !!p.isNew);
        const popularProducts = products.filter(p => !!p.isPopular);
        const discountProducts = products.filter(p => {
            const priceVal = parseFloat(p.price) || 0;
            const priceSaleVal = (p.priceSale != null && p.priceSale !== '') ? parseFloat(p.priceSale) : null;
            return priceSaleVal != null && priceSaleVal > 0 && priceVal > priceSaleVal;
        });

        const tabDataAll = [
            { id: 'popular', label: 'Популярные', items: popularProducts },
            { id: 'new', label: 'Новинки', items: newProducts },
            { id: 'discount', label: 'Скидка', items: discountProducts }
        ];
        const tabData = tabDataAll.filter(t => t.items.length > 0);
        const hasTabsContent = tabData.length > 0;
        let html = '';

        if (hasTabsContent) {
            const firstTab = tabData[0].id;
            const tabKindClass = (id) => (id === 'popular' ? 'store-tab--popular' : id === 'new' ? 'store-tab--new' : 'store-tab--discount');
            const tabsHtml = tabData.map(t => {
                const active = t.id === firstTab ? ' store-tab-active' : '';
                const kind = tabKindClass(t.id);
                return `<button type="button" class="store-tab ${kind}${active}" data-tab="${t.id}">${escapeStoreHtml(t.label)}</button>`;
            }).join('');
            const panesHtml = tabData.map(t => {
                const active = t.id === firstTab ? ' store-tab-pane-active' : '';
                const cardsHtml = t.items.map(p => buildProductCardHtml(p)).join('');
                return `<div class="store-tab-pane${active}" data-tab="${t.id}">
                    <div class="store-carousel-tabs-wrap">
                        <div class="store-carousel store-carousel-full">
                            <div class="store-carousel-inner store-carousel-inner-4">${cardsHtml}</div>
                        </div>
                        <nav class="store-carousel-nav">
                            <button type="button" class="store-carousel-nav-btn store-carousel-nav-prev" aria-label="Назад">‹</button>
                            <div class="store-carousel-dots"></div>
                            <button type="button" class="store-carousel-nav-btn store-carousel-nav-next" aria-label="Вперёд">›</button>
                        </nav>
                    </div>
                </div>`;
            }).join('');
            html += `<section class="store-section store-section-tabs">
                <nav class="store-tabs-nav">${tabsHtml}</nav>
                <div class="store-tabs-content">${panesHtml}</div>
            </section>`;
        }

        const byCategory = {};
        products.forEach(p => {
            const catIds = Array.isArray(p.categoryIds) ? p.categoryIds : [];
            if (catIds.length) {
                catIds.forEach(cid => {
                    if (!byCategory[cid]) byCategory[cid] = [];
                    byCategory[cid].push(p);
                });
            } else {
                if (!byCategory['_none']) byCategory['_none'] = [];
                byCategory['_none'].push(p);
            }
        });

        const catOrder = (storeCategoriesData || []).slice();
        const flatCats = [];
        const walk = (nodes) => { nodes.forEach(n => { flatCats.push(n); if (n.children?.length) walk(n.children); }); };
        walk(catOrder);
        const allSectionProducts = [];
        flatCats.forEach(c => {
            if (byCategory[c.id]) allSectionProducts.push(...byCategory[c.id]);
        });
        if (byCategory['_none']) allSectionProducts.push(...byCategory['_none']);

        if (allSectionProducts.length > 0) {
            const sortedProducts = [];
            const added = new Set();
            if (flatCats.length > 0) {
                flatCats.forEach(c => {
                    if (!byCategory[c.id]) return;
                    byCategory[c.id].forEach(p => {
                        if (!added.has(p._origIdx)) { added.add(p._origIdx); sortedProducts.push(p); }
                    });
                });
            }
            if (byCategory['_none']) {
                byCategory['_none'].forEach(p => {
                    if (!added.has(p._origIdx)) { added.add(p._origIdx); sortedProducts.push(p); }
                });
            }
            products.forEach(p => {
                if (!added.has(p._origIdx)) sortedProducts.push(p);
            });

            const cardsHtml = sortedProducts.map(p => buildProductCardHtml(p)).join('');
            html += `<section class="store-section store-section-all-products">
                <h2 class="store-section-title">Все товары</h2>
                <div class="store-catalog store-catalog-tiles">${cardsHtml}</div>
            </section>`;
        }

        if (!html) {
            html = '<p class="store-catalog-empty">В каталоге пока нет товаров</p>';
        }

        mainEl.innerHTML = html;
        bindProductCardEvents(mainEl);
        initCarousels(mainEl);
        initTabsAndCarouselNav(mainEl);
    }

    function initCarousels(container) {
        if (!container) return;
        container.querySelectorAll('.store-carousel-wrap').forEach(wrap => {
            const prev = wrap.querySelector('.store-carousel-prev');
            const next = wrap.querySelector('.store-carousel-next');
            const inner = wrap.querySelector('.store-carousel-inner');
            if (!inner || !prev || !next) return;
            const getScrollStep = () => {
                const card = inner.querySelector('.store-card');
                const gap = parseFloat(getComputedStyle(inner).gap) || 24;
                return card ? card.offsetWidth + gap : 260;
            };
            prev.addEventListener('click', () => {
                inner.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
            });
            next.addEventListener('click', () => {
                inner.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
            });
        });
    }

    function initTabsAndCarouselNav(container) {
        if (!container) return;
        const section = container.querySelector('.store-section-tabs');
        if (!section) return;

        const tabsNav = section.querySelector('.store-tabs-nav');
        const tabPanes = section.querySelectorAll('.store-tab-pane');
        const relayoutCarousels = () => {
            section.querySelectorAll('.store-carousel-tabs-wrap').forEach(w => {
                if (typeof w._storeCarouselRelayout === 'function') w._storeCarouselRelayout();
            });
        };
        tabsNav?.querySelectorAll('.store-tab').forEach(btn => {
            if (btn.disabled) return;
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                tabsNav.querySelectorAll('.store-tab').forEach(b => b.classList.remove('store-tab-active'));
                btn.classList.add('store-tab-active');
                tabPanes.forEach(p => {
                    p.classList.toggle('store-tab-pane-active', p.dataset.tab === tabId);
                });
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        relayoutCarousels();
                        const activePane = section.querySelector(`.store-tab-pane[data-tab="${tabId}"]`);
                        const activeWrap = activePane?.querySelector('.store-carousel-tabs-wrap');
                        if (activeWrap && typeof activeWrap._storeCarouselResetStart === 'function') {
                            activeWrap._storeCarouselResetStart();
                        }
                    });
                });
            });
        });

        section.querySelectorAll('.store-carousel-tabs-wrap').forEach(wrap => {
            const inner = wrap.querySelector('.store-carousel-inner-4') || wrap.querySelector('.store-carousel-inner');
            const dotsEl = wrap.querySelector('.store-carousel-dots');
            const prevBtn = wrap.querySelector('.store-carousel-nav-prev');
            const nextBtn = wrap.querySelector('.store-carousel-nav-next');
            if (!inner || !dotsEl || !prevBtn || !nextBtn) return;

            const cards = Array.from(inner.querySelectorAll('.store-card'));
            const N = cards.length;
            if (N === 0) return;

            const clearBoundDeep = (root) => {
                if (!root) return;
                if (root.dataset && root.dataset.storeBound) delete root.dataset.storeBound;
                if (root.querySelectorAll) {
                    root.querySelectorAll('[data-store-bound]').forEach(el => {
                        if (el.dataset && el.dataset.storeBound) delete el.dataset.storeBound;
                    });
                }
            };

            /**
             * При малом числе карточек (≤ ряда на витрине) бесконечная лента не нужна:
             * иначе [клон]+[оригиналы]+[клон] даёт визуально «тройник» из одного товара.
             */
            const useInfiniteStrip = N > 4;

            if (!useInfiniteStrip) {
                bindProductCardEvents(wrap);
                let currentIndex = 0;
                const getCardLeft = (i) => {
                    const el = inner.children[i];
                    return el ? Math.round(el.offsetLeft) : 0;
                };
                const getNearestIndex = () => {
                    if (N <= 1) return 0;
                    let nearest = 0;
                    let best = Number.POSITIVE_INFINITY;
                    for (let i = 0; i < N; i++) {
                        const d = Math.abs(inner.scrollLeft - getCardLeft(i));
                        if (d < best) {
                            best = d;
                            nearest = i;
                        }
                    }
                    return nearest;
                };
                const alignToCurrentIndex = (behavior = 'auto') => {
                    inner.scrollTo({ left: getCardLeft(currentIndex), behavior });
                };
                const syncDotsActive = () => {
                    dotsEl.querySelectorAll('.store-carousel-dot[data-index]').forEach((d, i) => {
                        d.classList.toggle('active', i === currentIndex);
                    });
                };
                const renderDots = () => {
                    dotsEl.innerHTML = Array.from({ length: N }, (_, i) =>
                        `<button type="button" class="store-carousel-dot${i === currentIndex ? ' active' : ''}" data-index="${i}" aria-label="Слайд ${i + 1}"></button>`
                    ).join('');
                    dotsEl.querySelectorAll('.store-carousel-dot[data-index]').forEach(dot => {
                        dot.addEventListener('click', () => {
                            const i = parseInt(dot.dataset.index, 10);
                            currentIndex = Math.max(0, Math.min(N - 1, i));
                            alignToCurrentIndex('smooth');
                        });
                    });
                };
                prevBtn.disabled = N <= 1;
                nextBtn.disabled = N <= 1;
                prevBtn.addEventListener('click', () => {
                    currentIndex = Math.max(0, currentIndex - 1);
                    alignToCurrentIndex('smooth');
                });
                nextBtn.addEventListener('click', () => {
                    currentIndex = Math.min(N - 1, currentIndex + 1);
                    alignToCurrentIndex('smooth');
                });
                let scrollEndFallback = null;
                const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;
                const onScrollEndSimple = () => {
                    currentIndex = getNearestIndex();
                    alignToCurrentIndex('auto');
                    syncDotsActive();
                };
                inner.addEventListener('scroll', () => {
                    currentIndex = getNearestIndex();
                    syncDotsActive();
                    if (!supportsScrollEnd) {
                        clearTimeout(scrollEndFallback);
                        scrollEndFallback = setTimeout(onScrollEndSimple, 120);
                    }
                }, { passive: true });
                if (supportsScrollEnd) {
                    inner.addEventListener('scrollend', onScrollEndSimple, { passive: true });
                }
                const onResize = () => {
                    if (!inner.isConnected) return;
                    currentIndex = Math.min(Math.max(0, currentIndex), N - 1);
                    alignToCurrentIndex('auto');
                    renderDots();
                };
                window.addEventListener('resize', onResize);
                wrap._storeCarouselRelayout = onResize;
                wrap._storeCarouselResetStart = () => {
                    currentIndex = 0;
                    inner.scrollLeft = 0;
                    renderDots();
                    syncDotsActive();
                };
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        currentIndex = 0;
                        inner.scrollLeft = 0;
                        renderDots();
                    });
                });
                return;
            }

            // Бесконечная лента: [клон] + [оригиналы] + [клон]
            const clonePre = cards.map(n => n.cloneNode(true));
            const clonePost = cards.map(n => n.cloneNode(true));
            clonePre.forEach(clearBoundDeep);
            clonePost.forEach(clearBoundDeep);

            inner.innerHTML = '';
            clonePre.forEach(n => inner.appendChild(n));
            cards.forEach(n => inner.appendChild(n));
            clonePost.forEach(n => inner.appendChild(n));

            bindProductCardEvents(wrap);

            const getSegmentMetrics = () => {
                const firstOriginal = inner.children[N];
                const firstPostClone = inner.children[2 * N];
                if (firstOriginal && firstPostClone) {
                    const start = firstOriginal.offsetLeft;
                    const width = firstPostClone.offsetLeft - firstOriginal.offsetLeft;
                    if (width > 0) return { start, width };
                }
                const fallback = inner.scrollWidth / 3;
                return { start: fallback, width: fallback };
            };
            const getMiddleCardLeft = (idx) => {
                const i = ((idx % N) + N) % N;
                const card = inner.children[N + i];
                if (!card) return getSegmentMetrics().start;
                return Math.round(card.offsetLeft);
            };
            const getNearestIndex = () => {
                if (N <= 1) return 0;
                let nearest = 0;
                let best = Number.POSITIVE_INFINITY;
                for (let i = 0; i < N; i++) {
                    const d = Math.abs(inner.scrollLeft - getMiddleCardLeft(i));
                    if (d < best) {
                        best = d;
                        nearest = i;
                    }
                }
                return nearest;
            };
            let currentIndex = 0;

            const getSlideIndex = () => {
                if (N === 0) return 0;
                return currentIndex;
            };
            const alignToCurrentIndex = (behavior = 'auto') => {
                inner.scrollTo({ left: getMiddleCardLeft(currentIndex), behavior });
            };
            const forceStabilizePosition = () => {
                alignToCurrentIndex('auto');
                [50, 140, 320, 650].forEach(ms => {
                    setTimeout(() => {
                        if (!inner.isConnected) return;
                        alignToCurrentIndex('auto');
                        syncDotsActive();
                    }, ms);
                });
            };

            const normalizeScroll = () => {
                const seg = getSegmentMetrics();
                if (seg.width <= 4) return;
                const eps = 4;
                if (inner.scrollLeft >= seg.start + seg.width - eps) {
                    inner.scrollLeft -= seg.width;
                } else if (inner.scrollLeft <= seg.start - seg.width + eps) {
                    inner.scrollLeft += seg.width;
                }
            };

            const renderDots = () => {
                const idx = getSlideIndex();
                dotsEl.innerHTML = Array.from({ length: N }, (_, i) =>
                    `<button type="button" class="store-carousel-dot${i === idx ? ' active' : ''}" data-index="${i}" aria-label="Слайд ${i + 1}"></button>`
                ).join('');
                dotsEl.querySelectorAll('.store-carousel-dot[data-index]').forEach(dot => {
                    dot.addEventListener('click', () => {
                        const i = parseInt(dot.dataset.index, 10);
                        currentIndex = ((i % N) + N) % N;
                        alignToCurrentIndex('smooth');
                    });
                });
            };

            const syncDotsActive = () => {
                const idx = getSlideIndex();
                dotsEl.querySelectorAll('.store-carousel-dot[data-index]').forEach((d, i) => {
                    d.classList.toggle('active', i === idx);
                });
            };

            const onScroll = () => {
                syncDotsActive();
            };

            const onScrollEnd = () => {
                normalizeScroll();
                currentIndex = getNearestIndex();
                alignToCurrentIndex('auto');
                syncDotsActive();
            };

            let scrollEndFallback = null;
            const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

            prevBtn.addEventListener('click', () => {
                currentIndex = ((currentIndex - 1) % N + N) % N;
                alignToCurrentIndex('smooth');
            });
            nextBtn.addEventListener('click', () => {
                currentIndex = (currentIndex + 1) % N;
                alignToCurrentIndex('smooth');
            });

            inner.addEventListener('scroll', () => {
                onScroll();
                if (!supportsScrollEnd) {
                    clearTimeout(scrollEndFallback);
                    scrollEndFallback = setTimeout(onScrollEnd, 120);
                }
            }, { passive: true });
            if (supportsScrollEnd) {
                inner.addEventListener('scrollend', onScrollEnd, { passive: true });
            }

            const onResize = () => {
                if (!inner.isConnected) return;
                const seg = getSegmentMetrics();
                if (seg.width <= 0) return;
                currentIndex = getNearestIndex();
                alignToCurrentIndex('auto');
                renderDots();
                forceStabilizePosition();
            };

            window.addEventListener('resize', onResize);
            wrap._storeCarouselRelayout = onResize;
            wrap._storeCarouselResetStart = () => {
                currentIndex = 0;
                alignToCurrentIndex('auto');
                syncDotsActive();
                forceStabilizePosition();
            };

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const seg = getSegmentMetrics();
                    if (seg.width <= 0) return;
                    currentIndex = 0;
                    alignToCurrentIndex('auto');
                    renderDots();
                    forceStabilizePosition();
                });
            });
        });
    }

    function renderCategoryPage() {
        const breadcrumbsEl = document.getElementById('storeBreadcrumbs');
        const catalogEl = document.getElementById('storeCategoryCatalog');
        if (!breadcrumbsEl || !catalogEl) return;

        const path = getBreadcrumbs(_selectedCategoryId);
        let bcHtml = '<a href="#">Главная</a>';
        path.forEach((item, i) => {
            bcHtml += ` <span class="store-breadcrumbs-sep">›</span> `;
            if (i === path.length - 1) {
                bcHtml += `<span>${escapeStoreHtml(item.name)}</span>`;
            } else {
                bcHtml += `<a href="#category/${encodeURIComponent(item.id)}">${escapeStoreHtml(item.name)}</a>`;
            }
        });
        breadcrumbsEl.innerHTML = bcHtml;
        breadcrumbsEl.querySelector('a[href="#"]')?.addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; });
        breadcrumbsEl.querySelectorAll('a[href^="#category/"]').forEach(a => {
            a.addEventListener('click', (e) => { e.preventDefault(); location.hash = a.getAttribute('href').slice(1); });
        });

        const all = storeProductsData || [];
        let products = all.map((p, idx) => ({ ...p, _origIdx: idx }))
            .filter(p => isStoreProductVisibleOnStorefront(p) && Array.isArray(p.categoryIds) && p.categoryIds.includes(_selectedCategoryId));
        products = filterBySearch(products);

        if (products.length === 0) {
            catalogEl.innerHTML = '<p class="store-catalog-empty">В этой категории пока нет товаров</p>';
        } else {
            catalogEl.innerHTML = products.map(p => buildProductCardHtml(p)).join('');
            bindProductCardEvents(catalogEl);
        }
    }

    let _productModalCurrentIdx = 0;
    let _productModalCurrentImgIdx = 0;
    let _productModalUrls = [];

    function openProductModal(productIndex, opts) {
        const p = storeProductsData && storeProductsData[productIndex];
        if (!p || !isStoreProductVisibleOnStorefront(p)) return;
        _productModalCurrentIdx = productIndex;
        _productModalUrls = Array.isArray(p.imageUrls) ? p.imageUrls : [];
        if (p.imageUrl && _productModalUrls.length === 0) _productModalUrls = [p.imageUrl];

        const modal = document.getElementById('storeProductModal');
        document.getElementById('storeProductModalTitle').textContent = p.name || 'Товар';
        document.getElementById('storeProductModalArticle').textContent = p.systemId ? 'Артикул: ' + p.systemId : '';
        const priceVal = parseFloat(p.price) || 0;
        const priceSaleVal = (p.priceSale != null && p.priceSale !== '') ? parseFloat(p.priceSale) : null;
        const hasDiscount = priceSaleVal != null && priceSaleVal > 0 && priceVal > priceSaleVal;
        const badgesEl = document.getElementById('storeProductModalBadges');
        if (badgesEl) {
            const badges = [];
            if (p.isNew) badges.push('<span class="store-product-modal-badge store-product-modal-badge-new">Новинка</span>');
            if (p.isPopular) badges.push('<span class="store-product-modal-badge store-product-modal-badge-popular">Популярный</span>');
            const discountPct = (hasDiscount && priceVal > 0) ? Math.round((1 - priceSaleVal / priceVal) * 100) : 0;
            if (hasDiscount) badges.push('<span class="store-product-modal-badge store-product-modal-badge-discount">Скидка ' + discountPct + '%</span>');
            badgesEl.innerHTML = badges.join('');
            badgesEl.style.display = badges.length ? 'flex' : 'none';
        }
        const priceEl = document.getElementById('storeProductModalPrice');
        if (hasDiscount) {
            priceEl.innerHTML = `<span class="store-product-modal-price-old">${priceVal.toFixed(0)} ₽</span> <span class="store-product-modal-price-current store-product-modal-price-sale">${priceSaleVal.toFixed(0)} ₽</span>`;
        } else {
            priceEl.innerHTML = `<span class="store-product-modal-price-current">${priceVal.toFixed(0)} ₽</span>`;
        }
        document.getElementById('storeProductModalDesc').innerHTML = p.description
            ? '<p>' + escapeStoreHtml(p.description).replace(/\n/g, '</p><p>') + '</p>'
            : '';
        document.getElementById('storeProductModalAddBtn').dataset.index = String(productIndex);
        document.getElementById('storeProductModalQty').value = '1';

        const favBtn = document.getElementById('storeProductModalFavBtn');
        if (favBtn) {
            favBtn.dataset.index = String(productIndex);
            const fav = isFavorite(productIndex);
            favBtn.classList.toggle('active', fav);
            favBtn.title = fav ? 'Убрать из избранного' : 'Добавить в избранное';
        }

        const mainImg = document.getElementById('storeProductModalImg');
        const placeholder = document.getElementById('storeProductModalPlaceholder');
        const thumbsWrap = document.getElementById('storeProductModalThumbs');
        const prevBtn = document.querySelector('.store-product-slider-prev');
        const nextBtn = document.querySelector('.store-product-slider-next');

        if (_productModalUrls.length > 0) {
            mainImg.src = _productModalUrls[0];
            mainImg.style.display = '';
            placeholder.style.display = 'none';
        } else {
            mainImg.style.display = 'none';
            placeholder.style.display = '';
            mainImg.src = '';
        }

        _productModalCurrentImgIdx = 0;
        thumbsWrap.style.display = _productModalUrls.length > 1 ? 'flex' : 'none';
        thumbsWrap.innerHTML = _productModalUrls.map((url, i) =>
            `<button type="button" class="store-product-thumb ${i === 0 ? 'active' : ''}" data-index="${i}"><img src="${escapeStoreHtml(url)}" alt=""></button>`
        ).join('');
        thumbsWrap.querySelectorAll('.store-product-thumb').forEach(btn => {
            btn.addEventListener('click', () => setProductModalImage(parseInt(btn.dataset.index)));
        });

        prevBtn.style.display = _productModalUrls.length > 1 ? '' : 'none';
        nextBtn.style.display = _productModalUrls.length > 1 ? '' : 'none';

        const skipUrl = opts && opts.skipUrl;
        const slug = _indexToTovarSlug[productIndex];
        if (slug && !skipUrl) setTovarInUrlReplace(slug);
        applySeoForProductModal(p);

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        refreshStoreProductModalCartHint(productIndex);
    }

    function setProductModalImage(idx) {
        if (idx < 0 || idx >= _productModalUrls.length) return;
        _productModalCurrentImgIdx = idx;
        document.getElementById('storeProductModalImg').src = _productModalUrls[idx];
        document.getElementById('storeProductModalImg').style.display = '';
        document.getElementById('storeProductModalPlaceholder').style.display = 'none';
        document.querySelectorAll('.store-product-thumb').forEach((btn, i) => btn.classList.toggle('active', i === idx));
    }

    function closeProductModal() {
        closeProductImageFullscreen();
        document.getElementById('storeProductModal').classList.add('hidden');
        document.body.style.overflow = '';
        stripTovarFromUrlReplace();
        if (storeConfig) applySeoForStoreHome();
    }

    function openProductImageFullscreen() {
        const img = document.getElementById('storeProductModalImg');
        if (!img || !img.src) return;
        document.getElementById('storeProductImageFullscreenImg').src = img.src;
        document.getElementById('storeProductImageFullscreen').classList.remove('hidden');
        document.addEventListener('keydown', _fullscreenEscHandler);
    }

    function closeProductImageFullscreen() {
        const el = document.getElementById('storeProductImageFullscreen');
        if (el) el.classList.add('hidden');
        document.removeEventListener('keydown', _fullscreenEscHandler);
    }

    function _fullscreenEscHandler(e) {
        if (e.key === 'Escape') {
            const el = document.getElementById('storeProductImageFullscreen');
            if (el && !el.classList.contains('hidden')) closeProductImageFullscreen();
        }
    }

    function initProductModalHandlers() {
        const modal = document.getElementById('storeProductModal');
        if (!modal) return;
        const backdropEl = modal.querySelector('.store-product-modal-backdrop');
        if (backdropEl) backdropEl.addEventListener('click', closeProductModal);
        const closeEl = modal.querySelector('.store-product-modal-close');
        if (closeEl) closeEl.addEventListener('click', closeProductModal);
        const mainImgEl = document.getElementById('storeProductModalImg');
        if (mainImgEl) {
            mainImgEl.addEventListener('click', () => {
                if (_productModalUrls.length > 0) openProductImageFullscreen();
            });
        }
        const modalAddBtn = document.getElementById('storeProductModalAddBtn');
        if (modalAddBtn) {
            modalAddBtn.addEventListener('click', () => {
                const idx = parseInt(modalAddBtn.dataset.index, 10);
                const qty = parseInt(document.getElementById('storeProductModalQty').value, 10) || 1;
                if (!Number.isNaN(idx)) {
                    addToCart(idx, Math.max(1, Math.min(999, qty)));
                }
                // Анимация отклика, модалка при этом не закрывается
                modalAddBtn.classList.add('store-card-add--pulse');
                setTimeout(() => {
                    modalAddBtn.classList.remove('store-card-add--pulse');
                }, 260);
            });
        }
        const favBtn = document.getElementById('storeProductModalFavBtn');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                const idx = parseInt(favBtn.dataset.index, 10);
                if (!isNaN(idx)) {
                    toggleFavorite(idx);
                    refreshFavButtons();
                }
            });
        }
        const fullscreenEl = document.getElementById('storeProductImageFullscreen');
        if (fullscreenEl) {
            fullscreenEl.querySelector('.store-product-image-fullscreen-backdrop').addEventListener('click', closeProductImageFullscreen);
            fullscreenEl.querySelector('.store-product-image-fullscreen-close').addEventListener('click', closeProductImageFullscreen);
            fullscreenEl.querySelector('.store-product-image-fullscreen-img').addEventListener('click', (e) => { e.stopPropagation(); closeProductImageFullscreen(); });
        }
        const prevBtn = document.querySelector('.store-product-slider-prev');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (_productModalUrls.length <= 1) return;
                const idx = _productModalCurrentImgIdx <= 0 ? _productModalUrls.length - 1 : _productModalCurrentImgIdx - 1;
                setProductModalImage(idx);
            });
        }
        const nextBtn = document.querySelector('.store-product-slider-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (_productModalUrls.length <= 1) return;
                const idx = (_productModalCurrentImgIdx + 1) % _productModalUrls.length;
                setProductModalImage(idx);
            });
        }
        const cartHintLink = document.getElementById('storeProductModalCartHintLink');
        if (cartHintLink) {
            cartHintLink.addEventListener('click', () => closeProductModal());
        }
    }

    /**
     * Рендер страницы избранного /favorites
     */
    function renderFavoritesPage() {
        const listEl = document.getElementById('storeFavoritesList');
        const emptyEl = document.getElementById('storeFavoritesEmpty');
        if (!listEl) return;

        const favIndexes = getFavorites();
        const products = (storeProductsData || [])
            .map((p, idx) => ({ ...p, _origIdx: idx }))
            .filter(p => favIndexes.includes(p._origIdx) && isStoreProductVisibleOnStorefront(p));

        if (products.length === 0) {
            listEl.innerHTML = '';
            listEl.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
        } else {
            listEl.innerHTML = products.map(p => buildProductCardHtml(p)).join('');
            listEl.classList.remove('hidden');
            if (emptyEl) emptyEl.classList.add('hidden');
            bindProductCardEvents(listEl);
        }
    }

    /**
     * Парсинг оферты: **жирный** → <strong>, переносы строк → <br>
     */
    function parseOfferText(text) {
        if (!text || typeof text !== 'string') return '';
        return escapeStoreHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    /**
     * Открыть модалку "О магазине"
     */
    function openAboutModal() {
        const modal = document.getElementById('storeAboutModal');
        const body = document.getElementById('storeAboutModalBody');
        if (!modal || !body || !storeConfig) return;

        const s = storeConfig;
        const toHref = (label, url) => {
            if (!url) return '';
            if (url.startsWith('http') || url.startsWith('mailto') || url.startsWith('tel')) return url;
            if (label === 'Telegram') return 'https://t.me/' + String(url).replace(/^@/, '').replace(/^t\.me\//, '');
            if (label === 'Email') return 'mailto:' + url;
            if (label === 'Телефон') return 'tel:' + url;
            if (label === 'WhatsApp') return 'https://wa.me/' + String(url).replace(/\D/g, '');
            return url;
        };
        const socialLinks = [
            { label: 'VK', url: s.socialVk, icon: 'VK' },
            { label: 'Telegram', url: s.socialTelegram || s.contactTelegram, icon: 'TG' },
            { label: 'TikTok', url: s.socialTiktok, icon: 'TT' },
            { label: 'Instagram', url: s.socialInstagram, icon: 'IG' },
            { label: 'Email', url: s.socialEmail || s.contactEmail, icon: '✉' },
            { label: 'Телефон', url: s.socialPhone, icon: '☎' },
            { label: 'WhatsApp', url: s.socialWhatsapp, icon: 'WA' }
        ].filter(x => x.url).map(l => ({ ...l, href: toHref(l.label, l.url) }));

        let html = '';
        if (s.banner) {
            html += `<div class="store-about-banner"><img src="${escapeStoreHtml(s.banner)}" alt=""></div>`;
        }
        if (s.aboutDesc) {
            html += `<div class="store-about-desc">${escapeStoreHtml(s.aboutDesc).replace(/\n/g, '<br>')}</div>`;
        }
        if (socialLinks.length) {
            const iconSvgAbout = (key) => {
                const w = 24; const h = 24;
                const icons = {
                    VK: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.576-1.496c.586-.19 1.34 1.26 2.14 1.818.605.422 1.065.33 1.065.33l2.137-.03s1.117-.071.587-.964c-.043-.073-.307-.661-1.58-1.87-1.332-1.265-1.153-1.06.45-3.25.975-1.33 1.365-2.143 1.243-2.49-.116-.33-.836-.244-.836-.244l-2.406.015s-.178-.025-.31.056c-.13.078-.212.26-.212.26s-.382 1.03-.89 1.907c-1.07 1.822-1.498 1.919-1.67 1.803-.406-.27-.304-1.086-.304-1.665 0-1.812.27-2.565-.525-2.764-.263-.067-.456-.11-1.127-.117-.86-.01-1.59.003-2.004.207-.275.136-.486.44-.357.457.159.022.519.1.71.37.247.349.238 1.133.238 1.133s.142 2.11-.33 2.371c-.324.18-.768-.187-1.723-1.867-.488-.863-.856-1.817-.856-1.817s-.07-.175-.2-.27c-.156-.114-.374-.15-.374-.15l-2.286.015s-.343.01-.468.161c-.112.134-.009.41-.009.41s1.79 4.24 3.818 6.384c1.86 1.966 3.972 1.836 3.972 1.836h.96z"/></svg>',
                    Telegram: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
                    TikTok: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
                    Instagram: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
                    Email: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
                    'Телефон': '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',
                    WhatsApp: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
                };
                return icons[l.label] || '';
            };
            html += '<div class="store-about-social"><h4>Мы в соцсетях</h4><div class="store-about-social-links">';
            socialLinks.forEach(l => {
                const href = l.href || l.url;
                const svg = iconSvgAbout(l.label);
                html += `<a href="${escapeStoreHtml(href)}" target="_blank" rel="noopener" class="store-about-social-item">${svg ? svg + ' ' : ''}<span>${escapeStoreHtml(l.label)}</span></a>`;
            });
            html += '</div></div>';
        }
        if (s.sellerDetails) {
            html += `<div class="store-about-seller"><h4>Реквизиты продавца</h4><div class="store-about-seller-content">${escapeStoreHtml(s.sellerDetails).replace(/\n/g, '<br>')}</div></div>`;
        }
        if (s.offer) {
            html += `<div class="store-about-offer"><h4>Оферта</h4><div class="store-about-offer-content">${parseOfferText(s.offer)}</div></div>`;
        }
        body.innerHTML = html || '<p>Информация о магазине не заполнена.</p>';
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeAboutModal() {
        const modal = document.getElementById('storeAboutModal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    function openOfferModal() {
        const modal = document.getElementById('storeOfferModal');
        const body = document.getElementById('storeOfferModalBody');
        if (!modal || !body || !storeConfig || !storeConfig.offer) return;
        body.innerHTML = parseOfferText(storeConfig.offer);
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeOfferModal() {
        const modal = document.getElementById('storeOfferModal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    /**
     * Подвал: соцсети + ссылка на оферту
     */
    function renderStoreFooter() {
        const footer = document.getElementById('storeFooter');
        const linksEl = document.getElementById('storeFooterLinks');
        if (!footer || !linksEl || !storeConfig) return;

        const s = storeConfig;
        const toHref = (label, url) => {
            if (!url) return '';
            if (url.startsWith('http') || url.startsWith('mailto') || url.startsWith('tel')) return url;
            if (label === 'Telegram') return 'https://t.me/' + String(url).replace(/^@/, '').replace(/^t\.me\//, '');
            if (label === 'Email') return 'mailto:' + url;
            if (label === 'Телефон') return 'tel:' + url;
            if (label === 'WhatsApp') return 'https://wa.me/' + String(url).replace(/\D/g, '');
            return url;
        };
        const items = [
            { label: 'VK', url: s.socialVk, icon: 'vk' },
            { label: 'Telegram', url: s.socialTelegram || s.contactTelegram, icon: 'telegram' },
            { label: 'TikTok', url: s.socialTiktok, icon: 'tiktok' },
            { label: 'Instagram', url: s.socialInstagram, icon: 'instagram' },
            { label: 'Email', url: s.socialEmail || s.contactEmail, icon: 'email' },
            { label: 'Телефон', url: s.socialPhone, icon: 'phone' },
            { label: 'WhatsApp', url: s.socialWhatsapp, icon: 'whatsapp' }
        ].filter(x => x.url).map(l => ({ ...l, href: toHref(l.label, l.url) }));

        const iconSvg = (key) => {
            const w = 24; const h = 24;
            const icons = {
                vk: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.576-1.496c.586-.19 1.34 1.26 2.14 1.818.605.422 1.065.33 1.065.33l2.137-.03s1.117-.071.587-.964c-.043-.073-.307-.661-1.58-1.87-1.332-1.265-1.153-1.06.45-3.25.975-1.33 1.365-2.143 1.243-2.49-.116-.33-.836-.244-.836-.244l-2.406.015s-.178-.025-.31.056c-.13.078-.212.26-.212.26s-.382 1.03-.89 1.907c-1.07 1.822-1.498 1.919-1.67 1.803-.406-.27-.304-1.086-.304-1.665 0-1.812.27-2.565-.525-2.764-.263-.067-.456-.11-1.127-.117-.86-.01-1.59.003-2.004.207-.275.136-.486.44-.357.457.159.022.519.1.71.37.247.349.238 1.133.238 1.133s.142 2.11-.33 2.371c-.324.18-.768-.187-1.723-1.867-.488-.863-.856-1.817-.856-1.817s-.07-.175-.2-.27c-.156-.114-.374-.15-.374-.15l-2.286.015s-.343.01-.468.161c-.112.134-.009.41-.009.41s1.79 4.24 3.818 6.384c1.86 1.966 3.972 1.836 3.972 1.836h.96z"/></svg>',
                telegram: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
                tiktok: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
                instagram: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
                email: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
                phone: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',
                whatsapp: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
            };
            return icons[key] || '';
        };

        let html = '';
        items.forEach(l => {
            html += `<a href="${escapeStoreHtml(l.href)}" target="_blank" rel="noopener" class="store-footer-link" title="${escapeStoreHtml(l.label)}">${iconSvg(l.icon)}</a>`;
        });
        if (s.offer) {
            html += `<a href="#" class="store-footer-link store-footer-offer store-footer-offer-text" id="storeFooterOfferLink">Оферта</a>`;
        }
        const hasContacts = s.aboutContacts || items.length > 0 || s.sellerDetails;
        if (hasContacts) {
            html += `<a href="#" class="store-footer-link store-footer-contacts store-footer-offer-text" id="storeFooterContactsLink">Контакты</a>`;
        }
        linksEl.innerHTML = html || '';
        footer.classList.toggle('hidden', !html);
        document.getElementById('storeFooterOfferLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            openOfferModal();
        });
        document.getElementById('storeFooterContactsLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            openContactsModal();
        });
    }

    function openContactsModal() {
        const modal = document.getElementById('storeContactsModal');
        const body = document.getElementById('storeContactsModalBody');
        if (!modal || !body || !storeConfig) return;
        const s = storeConfig;
        const toHref = (label, url) => {
            if (!url) return '';
            if (url.startsWith('http') || url.startsWith('mailto') || url.startsWith('tel')) return url;
            if (label === 'Telegram') return 'https://t.me/' + String(url).replace(/^@/, '').replace(/^t\.me\//, '');
            if (label === 'Email') return 'mailto:' + url;
            if (label === 'Телефон') return 'tel:' + url;
            if (label === 'WhatsApp') return 'https://wa.me/' + String(url).replace(/\D/g, '');
            return url;
        };
        const socialLinks = [
            { label: 'VK', url: s.socialVk }, { label: 'Telegram', url: s.socialTelegram || s.contactTelegram },
            { label: 'TikTok', url: s.socialTiktok }, { label: 'Instagram', url: s.socialInstagram },
            { label: 'Email', url: s.socialEmail || s.contactEmail }, { label: 'Телефон', url: s.socialPhone },
            { label: 'WhatsApp', url: s.socialWhatsapp }
        ].filter(x => x.url).map(l => ({ ...l, href: toHref(l.label, l.url) }));

        let html = '';
        if (s.aboutContacts) {
            html += '<div class="store-contacts-about">' + parseOfferText(s.aboutContacts) + '</div>';
        }
        if (socialLinks.length) {
            const iconSvg = (key) => {
                const w = 24; const h = 24;
                const icons = { vk: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.576-1.496c.586-.19 1.34 1.26 2.14 1.818.605.422 1.065.33 1.065.33l2.137-.03s1.117-.071.587-.964c-.043-.073-.307-.661-1.58-1.87-1.332-1.265-1.153-1.06.45-3.25.975-1.33 1.365-2.143 1.243-2.49-.116-.33-.836-.244-.836-.244l-2.406.015s-.178-.025-.31.056c-.13.078-.212.26-.212.26s-.382 1.03-.89 1.907c-1.07 1.822-1.498 1.919-1.67 1.803-.406-.27-.304-1.086-.304-1.665 0-1.812.27-2.565-.525-2.764-.263-.067-.456-.11-1.127-.117-.86-.01-1.59.003-2.004.207-.275.136-.486.44-.357.457.159.022.519.1.71.37.247.349.238 1.133.238 1.133s.142 2.11-.33 2.371c-.324.18-.768-.187-1.723-1.867-.488-.863-.856-1.817-.856-1.817s-.07-.175-.2-.27c-.156-.114-.374-.15-.374-.15l-2.286.015s-.343.01-.468.161c-.112.134-.009.41-.009.41s1.79 4.24 3.818 6.384c1.86 1.966 3.972 1.836 3.972 1.836h.96z"/></svg>', telegram: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>', tiktok: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>', instagram: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>', email: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>', phone: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>', whatsapp: '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' };
                return icons[key] || '';
            };
            const iconMap = { VK: 'vk', Telegram: 'telegram', TikTok: 'tiktok', Instagram: 'instagram', Email: 'email', 'Телефон': 'phone', WhatsApp: 'whatsapp' };
            html += '<div class="store-contacts-section"><h4>Контакты</h4><div class="store-contacts-rows">';
            socialLinks.forEach(l => {
                const icon = iconSvg(iconMap[l.label] || '');
                const displayText = l.url;
                html += `<a href="${escapeStoreHtml(l.href)}" target="_blank" rel="noopener" class="store-contacts-row"><span class="store-contacts-row-icon">${icon}</span><span class="store-contacts-row-label">${escapeStoreHtml(l.label)}:</span><span class="store-contacts-row-value">${escapeStoreHtml(displayText)}</span></a>`;
            });
            html += '</div></div>';
        }
        if (s.sellerDetails) {
            html += '<div class="store-contacts-section"><h4>Реквизиты продавца</h4><div class="store-contacts-seller">' + escapeStoreHtml(s.sellerDetails).replace(/\n/g, '<br>') + '</div></div>';
        }
        body.innerHTML = html || '<p>Нет контактной информации.</p>';
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeContactsModal() {
        const modal = document.getElementById('storeContactsModal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    /**
     * Авторизация в магазине
     */
    function initStoreAuth() {
        const authBtn = document.getElementById('storeAuthBtn');
        if (!authBtn) return;

        authBtn.classList.remove('hidden');

        function updateAuthBtn(user) {
            const outline = authBtn.querySelector('.store-auth-icon-outline');
            const filled = authBtn.querySelector('.store-auth-icon-filled');
            if (user) {
                authBtn.classList.add('logged-in');
                authBtn.title = user.email || 'Личный кабинет';
                authBtn.onclick = () => { location.hash = 'account'; };
                if (outline) outline.style.display = 'none';
                if (filled) filled.style.display = '';
            } else {
                authBtn.classList.remove('logged-in');
                authBtn.title = 'Вход';
                authBtn.onclick = openStoreAuthModal;
                if (outline) outline.style.display = '';
                if (filled) filled.style.display = 'none';
            }
        }

        firebase.auth().onAuthStateChanged(updateAuthBtn);
        updateAuthBtn(firebase.auth().currentUser);

        document.getElementById('storeBackFromAccount')?.addEventListener('click', (e) => {
            e.preventDefault();
            location.hash = '';
        });
        document.getElementById('storeAccountLogoutBtn')?.addEventListener('click', () => {
            if (confirm('Выйти из аккаунта?')) {
                firebase.auth().signOut();
                location.hash = '';
                applyRoute();
            }
        });

        const authModal = document.getElementById('storeAuthModal');
        if (!authModal) return;
        authModal.querySelector('.store-auth-modal-backdrop')?.addEventListener('click', closeStoreAuthModal);
        authModal.querySelector('.store-auth-modal-close')?.addEventListener('click', closeStoreAuthModal);

        document.getElementById('storeAuthShowRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('storeAuthLoginForm').classList.add('hidden');
            document.getElementById('storeAuthRegisterForm').classList.remove('hidden');
            document.getElementById('storeAuthVerifyWait').classList.add('hidden');
        });
        document.getElementById('storeAuthShowLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('storeAuthLoginForm').classList.remove('hidden');
            document.getElementById('storeAuthRegisterForm').classList.add('hidden');
            document.getElementById('storeAuthVerifyWait').classList.add('hidden');
        });

        document.getElementById('storeLoginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('storeAuthMessage');
            const email = document.getElementById('storeLoginEmail').value;
            const pass = document.getElementById('storeLoginPassword').value;
            msg.style.display = 'none';
            try {
                await firebase.auth().signInWithEmailAndPassword(email, pass);
                const user = firebase.auth().currentUser;
                if (user && !user.emailVerified) {
                    await firebase.auth().signOut();
                    throw new Error('Подтвердите email. Проверьте почту.');
                }
                closeStoreAuthModal();
            } catch (err) {
                msg.textContent = err.message || 'Ошибка входа';
                msg.style.display = 'block';
            }
        });

        document.getElementById('storeRegisterForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('storeAuthMessage');
            const email = document.getElementById('storeRegisterEmail').value;
            const pass = document.getElementById('storeRegisterPassword').value;
            msg.style.display = 'none';
            try {
                const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass);
                await cred.user.sendEmailVerification();
                document.getElementById('storeAuthRegisterForm').classList.add('hidden');
                document.getElementById('storeAuthVerifyWait').classList.remove('hidden');
                document.getElementById('storeVerifyEmailSpan').textContent = email;
            } catch (err) {
                msg.textContent = err.message || 'Ошибка регистрации';
                msg.style.display = 'block';
            }
        });

        document.getElementById('storeAuthVerifyReload')?.addEventListener('click', () => window.location.reload());
        document.getElementById('storeAuthVerifyResend')?.addEventListener('click', async () => {
            const user = firebase.auth().currentUser;
            if (user) {
                await user.sendEmailVerification();
                alert('Письмо отправлено повторно.');
            }
        });

        document.getElementById('storeOfferModal')?.querySelector('.store-offer-modal-backdrop')?.addEventListener('click', closeOfferModal);
        document.getElementById('storeOfferModal')?.querySelector('.store-offer-modal-close')?.addEventListener('click', closeOfferModal);
        document.getElementById('storeContactsModal')?.querySelector('.store-offer-modal-backdrop')?.addEventListener('click', closeContactsModal);
        document.getElementById('storeContactsModal')?.querySelector('.store-offer-modal-close')?.addEventListener('click', closeContactsModal);
    }

    function getAccountOrderItemImageUrl(item) {
        const list = storeProductsData || [];
        if (item && item.productId) {
            const pid = String(item.productId);
            const byPid = list.find((p) => String(p.productId || '') === pid);
            if (byPid) {
                const urls = Array.isArray(byPid.imageUrls) ? byPid.imageUrls : [];
                return urls[0] || byPid.imageUrl || '';
            }
        }
        const name = (item && item.name) ? String(item.name).trim() : '';
        if (name) {
            const byName = list.find((p) => (p.name || '').trim() === name);
            if (byName) {
                const urls = Array.isArray(byName.imageUrls) ? byName.imageUrls : [];
                return urls[0] || byName.imageUrl || '';
            }
        }
        return '';
    }

    function normalizeAccountOrderLine(i) {
        const qty = Math.max(1, parseFloat(i && i.qty) || 1);
        const price = Math.max(0, parseFloat(i && i.price) || 0);
        let total = i && i.total != null ? parseFloat(i.total) : NaN;
        if (!Number.isFinite(total)) total = price * qty;
        return {
            name: (i && i.name) ? String(i.name) : 'Товар',
            qty,
            price,
            total: Math.round(total * 100) / 100
        };
    }

    async function renderAccountPage() {
        const listEl = document.getElementById('storeAccountOrdersList');
        const emptyEl = document.getElementById('storeAccountOrdersEmpty');
        const user = firebase.auth().currentUser;
        if (!listEl || !user) return;

        try {
            const ordersById = new Map();
            const addOrder = (child) => {
                const o = child.val();
                if (o && o.ownerUid === storeOwnerUid && !ordersById.has(child.key)) {
                    ordersById.set(child.key, { id: child.key, ...o });
                }
            };
            const snapByUid = await firebase.database().ref('storeOrders').orderByChild('buyerUid').equalTo(user.uid).once('value');
            snapByUid.forEach(addOrder);
            if (user.email) {
                const snapByEmail = await firebase.database().ref('storeOrders').orderByChild('buyerEmail').equalTo(user.email).once('value');
                snapByEmail.forEach(addOrder);
            }
            const orders = Array.from(ordersById.values());
            orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

            if (orders.length === 0) {
                listEl.innerHTML = '';
                if (emptyEl) emptyEl.classList.remove('hidden');
            } else {
                listEl.innerHTML = orders.map((o) => {
                    const date = o.createdAt ? new Date(o.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                    const orderNo = (o.orderNumber && String(o.orderNumber).trim())
                        ? normalizeStoreOrderNumberForDisplay(String(o.orderNumber).trim())
                        : (o.id ? `Заказ …${o.id.slice(-6)}` : 'Заказ');
                    const lines = Array.isArray(o.items) ? o.items.map(normalizeAccountOrderLine) : [];
                    const linesHtml = lines.map((line, lineIdx) => {
                        const rawItem = o.items[lineIdx];
                        const previewUrl = getAccountOrderItemImageUrl(rawItem || { name: line.name });
                        const prev = previewUrl ? `<span class="store-account-order-line-preview"><img src="${escapeStoreHtml(previewUrl)}" alt=""></span>` : '';
                        return `<div class="store-account-order-line">
                            <span class="store-account-order-line-num">${lineIdx + 1}</span>
                            <div class="store-account-order-line-name-wrap">
                                <span class="store-account-order-line-name">${escapeStoreHtml(line.name)}</span>
                                ${prev}
                            </div>
                            <span class="store-account-order-line-price">${line.price.toFixed(0)}&nbsp;₽</span>
                            <span class="store-account-order-line-qty">${line.qty}</span>
                            <span class="store-account-order-line-sum">${line.total.toFixed(0)}&nbsp;₽</span>
                        </div>`;
                    }).join('');
                    const total = (o.total != null) ? parseFloat(o.total).toFixed(0) : '—';
                    const headRow = lines.length
                        ? `<div class="store-account-order-lines-head" aria-hidden="true">
                            <span class="store-account-order-lines-head-num"></span>
                            <span>Наименование</span>
                            <span>Цена</span>
                            <span>Кол-во</span>
                            <span>Стоимость</span>
                        </div>`
                        : '';
                    return `<div class="store-account-order-card">
                        <div class="store-account-order-head">
                            <span class="store-account-order-number">${escapeStoreHtml(orderNo)}</span>
                            <span class="store-account-order-date-part">${escapeStoreHtml(date)}</span>
                        </div>
                        ${headRow}
                        <div class="store-account-order-lines">${linesHtml}</div>
                        <div class="store-account-order-total">Итого: ${total} ₽</div>
                    </div>`;
                }).join('');
                if (emptyEl) emptyEl.classList.add('hidden');
            }
        } catch (e) {
            console.error('[Store] load customer orders:', e);
            listEl.innerHTML = '<p class="store-account-error">Ошибка загрузки заказов</p>';
            if (emptyEl) emptyEl.classList.add('hidden');
        }
    }

    function openStoreAuthModal() {
        document.getElementById('storeAuthLoginForm').classList.remove('hidden');
        document.getElementById('storeAuthRegisterForm').classList.add('hidden');
        document.getElementById('storeAuthVerifyWait').classList.add('hidden');
        document.getElementById('storeAuthMessage').style.display = 'none';
        document.getElementById('storeAuthModal').classList.remove('hidden');
    }

    function closeStoreAuthModal() {
        document.getElementById('storeAuthModal').classList.add('hidden');
    }

    /**
     * Рендер страницы корзины /cart
     */
    function renderCartPage() {
        const list = document.getElementById('storeCartList');
        const empty = document.getElementById('storeCartEmpty');
        const footer = document.getElementById('storeCartFooter');
        const totalVal = document.getElementById('storeCartTotalVal');
        const checkoutBtn = document.getElementById('storeCheckoutBtn');
        if (!list) return;

        const items = getCart();
        const total = getCartTotal();

        list.innerHTML = renderCartItemsHtml(items, false);
        if (empty) empty.classList.toggle('hidden', items.length > 0);
        if (footer) footer.classList.toggle('hidden', items.length === 0);
        if (totalVal) totalVal.textContent = total.toFixed(0);

        if (checkoutBtn) checkoutBtn.onclick = openCheckoutModal;

        // Делегирование: qty, remove
        list.querySelectorAll('.store-cart-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const idx = parseInt(btn.dataset.index);
                updateCartQty(idx, action === 'plus' ? 1 : -1);
            });
        });
        list.querySelectorAll('.store-cart-item-remove').forEach(btn => {
            btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.index)));
        });
        list.querySelectorAll('.store-cart-item-name-clickable').forEach(el => {
            el.addEventListener('click', () => openProductModal(parseInt(el.dataset.productIndex)));
        });
    }

    /**
     * Drawer: открыть/закрыть
     */
    function openCartDrawer() {
        const drawer = document.getElementById('storeCartDrawer');
        if (drawer) {
            drawer.classList.add('store-cart-drawer--open');
            drawer.setAttribute('aria-hidden', 'false');
        }
    }

    function closeCartDrawer() {
        const drawer = document.getElementById('storeCartDrawer');
        if (drawer) {
            drawer.classList.remove('store-cart-drawer--open');
            drawer.setAttribute('aria-hidden', 'true');
        }
    }

    function isStoreCheckoutEmailValid(raw) {
        const v = (raw || '').trim();
        if (!v) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    /**
     * Кнопка «Отправить заказ» только при корректном непустом email.
     */
    function updateCheckoutSubmitEnabled() {
        const emailEl = document.getElementById('storeBuyerEmail');
        const btn = document.getElementById('storeCheckoutSubmitBtn');
        if (!btn) return;
        const ok = emailEl && isStoreCheckoutEmailValid(emailEl.value);
        btn.disabled = !ok;
        btn.title = ok ? '' : 'Укажите email для оформления заказа';
    }

    /**
     * Форма оформления заказа
     */
    function openCheckoutModal() {
        const total = getCartTotal();
        const minAmount = storeConfig && storeConfig.minOrderAmount != null ? parseFloat(storeConfig.minOrderAmount) : null;
        if (minAmount != null && total < minAmount) {
            alert(`Минимальная сумма заказа: ${minAmount.toFixed(0)} ₽. Ваша сумма: ${total.toFixed(0)} ₽.`);
            return;
        }
        const cartComment = document.getElementById('storeCartComment');
        const buyerComment = document.getElementById('storeBuyerComment');
        if (cartComment && buyerComment) buyerComment.value = cartComment.value || '';
        const user = firebase.auth().currentUser;
        const emailEl = document.getElementById('storeBuyerEmail');
        if (emailEl && user && user.email) emailEl.value = user.email;
        document.getElementById('storeCheckoutModal').classList.remove('hidden');
        updateCheckoutSubmitEnabled();
    }

    function closeCheckoutModal() {
        document.getElementById('storeCheckoutModal').classList.add('hidden');
    }

    function normalizeStoreOrderNumberPrefix(prefix) {
        return String(prefix || 'ORD').replace(/-+\s*$/, '').trim() || 'ORD';
    }

    function normalizeStoreOrderNumberForDisplay(s) {
        if (!s || typeof s !== 'string') return s;
        return s.replace(/^ИМ--(\d)/, 'ИМ-$1').replace(/^АДМ--(\d)/, 'АДМ-$1');
    }

    /**
     * Единый глобальный счётчик storeOrderSeq с админкой: 1001, 1002, …
     * Префикс без завершающего «-»: иначе ИМ- + - + n даёт двойной прочерк.
     */
    async function getNextGlobalStoreOrderNumber(prefix) {
        const base = normalizeStoreOrderNumberPrefix(prefix);
        const seqRef = firebase.database().ref('storeOrderSeq');
        const tx = await seqRef.transaction((current) => {
            if (typeof current === 'number' && Number.isFinite(current)) {
                return Math.max(1000, current + 1);
            }
            return 1001;
        });
        if (tx && tx.committed === false) {
            throw new Error('STORE_ORDER_SEQ_NOT_COMMITTED');
        }
        const n = tx.snapshot && typeof tx.snapshot.val === 'function' ? tx.snapshot.val() : 1001;
        return `${base}-${String(n).padStart(4, '0')}`;
    }

    async function submitOrder() {
        const name = (document.getElementById('storeBuyerName') && document.getElementById('storeBuyerName').value || '').trim();
        const emailEl = document.getElementById('storeBuyerEmail');
        const email = (emailEl && emailEl.value || '').trim();
        const phone = (document.getElementById('storeBuyerPhone') && document.getElementById('storeBuyerPhone').value || '').trim();
        const comment = (document.getElementById('storeBuyerComment') && document.getElementById('storeBuyerComment').value || '').trim();

        if (!isStoreCheckoutEmailValid(email)) {
            if (emailEl) {
                emailEl.focus();
                if (typeof emailEl.reportValidity === 'function') emailEl.reportValidity();
            }
            return;
        }

        const items = getCart();
        if (items.length === 0) {
            alert('Корзина пуста');
            return;
        }
        if (!storeOwnerUid) {
            alert('Магазин не загружен. Обновите страницу и попробуйте снова.');
            return;
        }

        const total = getCartTotal();
        const user = firebase.auth().currentUser;
        const orderNumber = await getNextGlobalStoreOrderNumber('ИМ');
        const orderData = {
            ownerUid: String(storeOwnerUid),
            subdomain: storeSubdomain || '',
            items: items.map(x => ({ name: x.name, price: x.price, qty: x.qty, productId: x.productId })),
            total: Math.round(total * 100) / 100,
            orderNumber,
            source: 'store',
            buyerName: name,
            buyerEmail: email,
            buyerPhone: phone || '',
            comment: comment || '',
            createdAt: new Date().toISOString(),
            status: 'new'
        };
        if (user && user.uid) orderData.buyerUid = user.uid;

        const db = firebase.database();
        const ordersRef = db.ref('storeOrders');
        try {
            document.getElementById('storeCheckoutSubmitBtn').disabled = true;
            await ordersRef.push(orderData);
            clearCart();
            closeCheckoutModal();
            document.getElementById('storeCheckoutForm').reset();
            const cartCommentEl = document.getElementById('storeCartComment');
            if (cartCommentEl) cartCommentEl.value = '';
            const successEl = document.getElementById('storeOrderSuccess');
            if (successEl) {
                successEl.classList.remove('hidden');
                document.getElementById('storeOrderSuccessOkBtn')?.focus();
            }
            if (getRoute().type === 'cart') {
                location.hash = firebase.auth().currentUser ? 'account' : '';
            }
            applyRoute();
        } catch (e) {
            console.error('[Store] submitOrder error:', e);
            alert('Ошибка отправки заказа. Попробуйте позже.');
        } finally {
            const sub = document.getElementById('storeCheckoutSubmitBtn');
            if (sub) sub.disabled = false;
            updateCheckoutSubmitEnabled();
        }
    }

    /**
     * Привязка событий
     */
    function bindStoreEvents() {
        const cartBtn = document.getElementById('storeCartBtn');
        const drawer = document.getElementById('storeCartDrawer');
        const drawerClose = drawer && drawer.querySelector('.store-cart-drawer-close');
        const drawerBackdrop = drawer && drawer.querySelector('.store-cart-drawer-backdrop');
        const drawerPanel = drawer && drawer.querySelector('.store-cart-drawer-panel');
        const form = document.getElementById('storeCheckoutForm');
        const backdrop = document.querySelector('.store-checkout-backdrop');

        if (cartBtn) cartBtn.addEventListener('click', openCartDrawer);
        if (drawerClose) drawerClose.addEventListener('click', closeCartDrawer);
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeCartDrawer);
        const toCartBtn = document.getElementById('storeCartDrawerToPage');
        if (toCartBtn) toCartBtn.addEventListener('click', () => { closeCartDrawer(); location.hash = 'cart'; applyRoute(); });
        if (drawerPanel) {
            drawerPanel.addEventListener('click', (e) => {
                const btn = e.target.closest('.store-cart-qty-btn');
                if (btn) {
                    const action = btn.dataset.action;
                    const idx = parseInt(btn.dataset.index);
                    updateCartQty(idx, action === 'plus' ? 1 : -1);
                    e.preventDefault();
                }
                const remove = e.target.closest('.store-cart-item-remove');
                if (remove) {
                    removeFromCart(parseInt(remove.dataset.index));
                    e.preventDefault();
                }
                const nameClick = e.target.closest('.store-cart-item-name-clickable');
                if (nameClick) {
                    closeCartDrawer();
                    openProductModal(parseInt(nameClick.dataset.productIndex));
                    e.preventDefault();
                }
            });
        }
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const emailInput = document.getElementById('storeBuyerEmail');
                if (!isStoreCheckoutEmailValid(emailInput && emailInput.value)) {
                    if (emailInput) {
                        emailInput.focus();
                        if (typeof emailInput.reportValidity === 'function') emailInput.reportValidity();
                    }
                    return;
                }
                submitOrder().catch((err) => {
                    console.error('[Store] submitOrder:', err);
                    alert('Ошибка отправки заказа. Попробуйте позже.');
                    const sub = document.getElementById('storeCheckoutSubmitBtn');
                    if (sub) sub.disabled = false;
                    updateCheckoutSubmitEnabled();
                });
            });
        }
        const checkoutEmail = document.getElementById('storeBuyerEmail');
        if (checkoutEmail) {
            checkoutEmail.addEventListener('input', updateCheckoutSubmitEnabled);
            checkoutEmail.addEventListener('change', updateCheckoutSubmitEnabled);
        }
        const orderSuccessOk = document.getElementById('storeOrderSuccessOkBtn');
        const orderSuccessEl = document.getElementById('storeOrderSuccess');
        if (orderSuccessOk && orderSuccessEl) {
            orderSuccessOk.addEventListener('click', () => {
                orderSuccessEl.classList.add('hidden');
                const u = firebase.auth().currentUser;
                location.hash = u ? 'account' : '';
                applyRoute();
            });
        }
        if (backdrop) backdrop.addEventListener('click', closeCheckoutModal);

        const backLink = document.getElementById('storeBackToCatalog');
        if (backLink) backLink.addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; });
        const backFromFav = document.getElementById('storeBackFromFavorites');
        if (backFromFav) backFromFav.addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; });
        const logoLink = document.getElementById('storeLogoLink');
        if (logoLink) logoLink.addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; });
        const favoritesBtn = document.getElementById('storeFavoritesBtn');
        if (favoritesBtn) favoritesBtn.addEventListener('click', () => { location.hash = 'favorites'; });
        const aboutModal = document.getElementById('storeAboutModal');
        if (aboutModal) {
            aboutModal.querySelector('.store-about-modal-backdrop')?.addEventListener('click', closeAboutModal);
            aboutModal.querySelector('.store-about-modal-close')?.addEventListener('click', closeAboutModal);
        }

        const hamburgerBtn = document.getElementById('storeHamburgerBtn');
        const categoriesDrawer = document.getElementById('storeCategoriesDrawer');
        if (hamburgerBtn) hamburgerBtn.addEventListener('click', openCategoriesDrawer);

        const searchWrap = document.getElementById('storeSearchWrap');
        const searchToggle = document.getElementById('storeSearchToggle');
        const searchInput = document.getElementById('storeSearchInput');
        const searchClose = document.getElementById('storeSearchClose');
        const searchDropdown = document.getElementById('storeSearchDropdown');
        const goToMainWithSearch = () => {
            const value = (searchInput?.value || '').trim();
            _storeSearchTerm = value;
            location.hash = '';
            applyRoute();
            if (searchWrap) {
                searchWrap.classList.add('expanded');
            }
            if (searchInput) {
                searchInput.value = value;
                searchInput.focus();
            }
        };
        const hideSearchDropdown = () => {
            if (!searchDropdown) return;
            searchDropdown.classList.add('hidden');
            searchDropdown.innerHTML = '';
        };
        const renderSearchDropdown = () => {
            if (!searchDropdown || !searchWrap || !searchInput) return;
            const term = (searchInput.value || '').trim().toLowerCase();
            if (!term) {
                hideSearchDropdown();
                return;
            }
            const list = (storeProductsData || [])
                .map((p, idx) => ({ ...p, _origIdx: idx }))
                .filter(p => isStoreProductVisibleOnStorefront(p))
                .filter(p => {
                    const name = (p.name || '').toLowerCase();
                    const desc = (p.description || '').toLowerCase();
                    const sysId = (p.systemId || '').toLowerCase();
                    return name.includes(term) || desc.includes(term) || sysId.includes(term);
                })
                .slice(0, 5);

            if (list.length === 0) {
                searchDropdown.innerHTML = '<div class="store-search-empty">Ничего не найдено</div>';
                searchDropdown.classList.remove('hidden');
                return;
            }

            searchDropdown.innerHTML = list.map(p => {
                const priceVal = parseFloat(p.price) || 0;
                const priceSaleVal = (p.priceSale != null && p.priceSale !== '') ? parseFloat(p.priceSale) : null;
                const hasDiscount = priceSaleVal != null && priceSaleVal > 0 && priceVal > priceSaleVal;
                const priceText = hasDiscount
                    ? `${priceSaleVal.toFixed(0)} ₽`
                    : `${priceVal.toFixed(0)} ₽`;
                return `<button type="button" class="store-search-suggestion" data-index="${p._origIdx}">
                    <span class="store-search-suggestion-title">${escapeStoreHtml(p.name || 'Товар')}</span>
                    <span class="store-search-suggestion-price">${priceText}</span>
                </button>`;
            }).join('') + '<button type="button" class="store-search-show-all">Показать все</button>';

            searchDropdown.querySelectorAll('.store-search-suggestion').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index, 10);
                    if (!Number.isNaN(idx)) openProductModal(idx);
                });
            });
            searchDropdown.querySelector('.store-search-show-all')?.addEventListener('click', () => {
                hideSearchDropdown();
                goToMainWithSearch();
            });
            searchDropdown.classList.remove('hidden');
        };
        if (searchWrap && searchToggle) {
            searchToggle.addEventListener('click', () => {
                searchWrap.classList.add('expanded');
                searchInput?.focus();
                renderSearchDropdown();
            });
        }
        if (searchClose) {
            searchClose.addEventListener('click', () => {
                searchWrap?.classList.remove('expanded');
                if (searchInput) searchInput.value = '';
                _storeSearchTerm = '';
                hideSearchDropdown();
                applyRoute();
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderSearchDropdown();
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    hideSearchDropdown();
                    goToMainWithSearch();
                }
            });
        }

        const header = document.getElementById('storeHeader');
        const sentinel = document.getElementById('storeHeaderSentinel');
        if (header && sentinel && 'IntersectionObserver' in window) {
            const obs = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    if (e.target.id === 'storeHeaderSentinel') {
                        header.classList.toggle('compact', !e.isIntersecting);
                    }
                });
            }, { threshold: 0, rootMargin: '-61px 0px 0px 0px' });
            obs.observe(sentinel);
        } else if (header) {
            const onScroll = () => {
                const y = window.pageYOffset ?? document.documentElement.scrollTop ?? document.body.scrollTop ?? 0;
                header.classList.toggle('compact', y > 60);
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            document.addEventListener('scroll', onScroll, { passive: true });
        }

        if (categoriesDrawer) {
            const backdrop = categoriesDrawer.querySelector('.store-categories-drawer-backdrop');
            const closeBtn = categoriesDrawer.querySelector('.store-categories-drawer-close');
            if (backdrop) backdrop.addEventListener('click', closeCategoriesDrawer);
            if (closeBtn) closeBtn.addEventListener('click', closeCategoriesDrawer);
        }
    }

    /**
     * Детальный лог для диагностики (откройте консоль браузера: F12 → Console).
     */
    function debugLog() {
        const info = {
            href: location.href,
            hostname: location.hostname,
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
            subdomain: getSubdomain()
        };
        console.log('[Store] Debug:', JSON.stringify(info, null, 2));
        return info;
    }
    window.STORE_DEBUG = debugLog;

    function tryOpenTovarFromQuery() {
        if (!storeOwnerUid || !storeProductsData) return;
        const slug = getStoreQueryParam('tovar');
        if (!slug) return;
        const idx = _tovarSlugToIndex[slug];
        if (idx === undefined) {
            stripTovarFromUrlReplace();
            return;
        }
        openProductModal(idx, { skipUrl: true });
    }

    /**
     * Инициализация Store SPA.
     * Резолв поддомена: storesBySubdomain/{subdomain} → ownerUid → store, storeProducts.
     */
    async function init() {
        debugLog();
        const subdomain = getSubdomain();

        if (!subdomain) {
            showState('notFound', {
                reason: 'Откройте страницу по адресу вида: {subdomain}.my-3d-print.ru (например, test-shop.my-3d-print.ru). ' +
                    'В режиме разработки: store.html?store=test-shop'
            });
            updateHeader('Магазин', 'Поддомен не указан');
            return;
        }

        // Инициализация Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        const db = firebase.database();

        showState('loading', { message: 'Загрузка магазина...' });
        updateHeader('Магазин: ' + subdomain, '');

        try {
            const subdomainKey = subdomain.toLowerCase();
            const subdomainSnap = await db.ref('storesBySubdomain/' + subdomainKey).once('value');
            const subdomainData = subdomainSnap.val();

            if (!subdomainData || !subdomainData.ownerUid) {
                showState('notFound', { reason: 'Магазин не зарегистрирован.' });
                updateHeader('Магазин: ' + subdomain, 'Магазин не найден');
                return;
            }

            const uid = subdomainData.ownerUid;
            const storeSnap = await db.ref('users/' + uid + '/store').once('value');
            const store = storeSnap.val();

            if (!store || store.enabled === false) {
                showState('notFound', { reason: 'Магазин не найден или отключён.' });
                updateHeader('Магазин: ' + subdomain, '');
                return;
            }

            storeOwnerUid = uid;
            storeConfig = store;
            storeSubdomain = subdomainKey;
            injectStoreYandexVerificationMeta(store.yandexVerificationMeta);
            injectStoreYandexMetrica(store.yandexMetricaSnippet);

            const storeProductsSnap = await db.ref('users/' + uid + '/storeProducts').once('value');
            const raw = storeProductsSnap.val();
            storeProductsData = raw && typeof raw === 'object' ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
            rebuildTovarSlugMaps();

            storeCategoriesData = await getStoreCategoriesTree(uid);
            storeCategoriesMap = buildCategoriesMap(storeCategoriesData);

            updateHeader(store.title || 'Магазин', store.description || '');
            applyStoreThemeColors();
            applyStoreSwimlaneColor();
            applyAddToCartButtonColor();
            bindStoreEvents();
            initProductModalHandlers();
            initStoreAuth();
            renderStoreFooter();
            renderCategoriesDrawer();
            window.addEventListener('hashchange', applyRoute);
            applyRoute();
            tryOpenTovarFromQuery();
            const modalAfterDeep = document.getElementById('storeProductModal');
            if (!modalAfterDeep || modalAfterDeep.classList.contains('hidden')) {
                if (storeConfig) applySeoForStoreHome();
            }
            updateCartUI();
            updateFavoritesUI();
        } catch (e) {
            console.error('[Store] Firebase error:', e);
            showState('notFound', { reason: 'Ошибка загрузки. Проверьте подключение к интернету.' });
            updateHeader('Магазин: ' + subdomain, '');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
