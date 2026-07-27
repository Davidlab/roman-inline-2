/**
 * Roman Inline 2 — core runtime.
 *
 * Provides the handler registration system, shared UI (toolbar, toast, link
 * popover, media frame, floating buttons), REST helpers, and edit session
 * management. Each widget type registers a dedicated handler via
 * RomanInline2.register(type, handler).
 *
 * Handler interface:
 *   {
 *     onClick:  function(event, widget, ctx)  — called on click inside widget
 *     onHover:  function(event, widget, ctx)  — called on mouseover (optional)
 *     onLeave:  function(event, widget, ctx)  — called on mouseout (optional)
 *   }
 *
 * ctx provides:
 *   getFields()           → Promise<fields response>
 *   editText(node, opts)  → starts inline text editing { key, kind, isAtomic }
 *   editLink(node, opts)  → starts link editing { key, url, targetBlank, isAtomic }
 *   replaceImage(node, opts) → starts image swap { key, isAtomic }
 *   replaceVideo(node, opts) → starts video swap { key, source_type, isAtomic }
 *   saveText(key, value, kind)        → Promise
 *   saveLink(key, url, targetBlank)   → Promise
 *   saveImage(key, attachmentId)      → Promise
 *   saveVideo(key, attachmentId, url, sourceType) → Promise
 *   refreshWidget()                   → Promise
 *   toast(msg, state)                 → void
 *   showButton(rect, text, icon, cb)  → void
 *   hideButton()                      → void
 *   openMedia()                       → void
 *   openVideoMedia()                  → void
 *   widgetId, widgetType, isAtomic, cfg, i18n
 */
( function ( wp, $ ) {
	'use strict';

	if ( ! window.romanInline2 || ! wp || ! wp.apiFetch ) {
		return;
	}

	const cfg   = window.romanInline2;
	const i18n  = cfg.i18n || {};
	const H     = {};          // registered handlers: type -> handler
	let active = false;
	let session = null;      // current edit session
	const fieldsCache = {};    // elementId -> fields response

	wp.apiFetch.use( wp.apiFetch.createNonceMiddleware( cfg.nonce ) );

	/* ----------------------------------------------------------------- */
	/* DOM helpers                                                        */
	/* ----------------------------------------------------------------- */

	function el( tag, cls, html ) {
		const n = document.createElement( tag );
		if ( cls ) { n.className = cls; }
		if ( html != null ) { n.innerHTML = html; }
		return n;
	}

	function cssEscape( s ) {
		if ( window.CSS && CSS.escape ) { return CSS.escape( s ); }
		return String( s ).replace( /[^a-zA-Z0-9_-]/g, '\\$&' );
	}

	/* ----------------------------------------------------------------- */
	/* Widget discovery                                                   */
	/* ----------------------------------------------------------------- */

	const WIDGET_SELECTOR = '.elementor-widget[data-id], [data-e-type][data-id], .e-con[data-id], .elementor-section[data-id]';

	function widgetOf( node ) {
		return node.closest ? node.closest( WIDGET_SELECTOR ) : null;
	}

	function widgetId( widget ) {
		return widget.getAttribute( 'data-id' );
	}

	function widgetType( widget ) {
		const wt = widget.getAttribute( 'data-widget_type' ) || '';
		const et = widget.getAttribute( 'data-e-type' ) || '';

		// data-widget_type has the specific type (e.g. "heading.default").
		if ( wt ) {
			return wt.split( '.' )[ 0 ];
		}

		// data-e-type has the atomic type (e.g. "e-heading") or generic "widget".
		if ( et && 'widget' !== et ) {
			return et;
		}

		// Atomic widgets often put the type in a class like "e-heading-base".
		const cls = widget.className || '';
		const m = cls.match( /\be-([a-z]+)-base\b/ );
		if ( m ) {
			return 'e-' + m[ 1 ];
		}

		return '';
	}

	function isAtomic( widget ) {
		const et = widget.getAttribute( 'data-e-type' ) || '';
		return et.indexOf( 'e-' ) === 0;
	}

	/* ----------------------------------------------------------------- */
	/* Node location (classic widgets)                                    */
	/* ----------------------------------------------------------------- */

	function buildSelector( match ) {
		let sel = match.tag || '*';
		( match.classes || [] ).forEach( function ( c ) { sel += '.' + cssEscape( c ); } );
		return sel;
	}

	// If a node's entire content is a single <a> wrapper (e.g. a linked
	// heading), edit the text inside the link rather than the wrapper itself.
	function preferTextNode( node ) {
		if ( ! node ) { return node; }
		const kids = node.children;
		if ( 1 === kids.length && 'A' === kids[ 0 ].tagName &&
			( kids[ 0 ].textContent || '' ).trim() === ( node.textContent || '' ).trim() ) {
			return kids[ 0 ];
		}
		return node;
	}

	function locateNode( widget, field, clicked ) {
		if ( field.match ) {
			const sel = buildSelector( field.match );
			if ( clicked ) {
				const near = clicked.closest( sel );
				if ( near && widget.contains( near ) ) { return near; }
			}
			const found = widget.querySelector( sel );
			if ( found ) { return found; }
		}
		return widget.querySelector( '.elementor-widget-container' ) || widget;
	}

	/* ----------------------------------------------------------------- */
	/* REST API                                                           */
	/* ----------------------------------------------------------------- */

	function apiGet( endpoint ) {
		return wp.apiFetch( { url: cfg.restRoot + endpoint, method: 'GET' } );
	}

	function apiPost( endpoint, data ) {
		return wp.apiFetch( { url: cfg.restRoot + endpoint, method: 'POST', data: data } );
	}

	function getFields( id ) {
		if ( fieldsCache[ id ] ) { return Promise.resolve( fieldsCache[ id ] ); }
		return apiGet( 'fields?post_id=' + cfg.postId + '&element_id=' + encodeURIComponent( id ) )
			.then( function ( res ) { fieldsCache[ id ] = res; return res; } );
	}

	function saveText( id, key, value, kind ) {
		return apiPost( 'text', { post_id: cfg.postId, element_id: id, key: key, value: value, kind: kind } );
	}

	function saveLink( id, key, url, targetBlank ) {
		return apiPost( 'link', { post_id: cfg.postId, element_id: id, key: key, url: url, target_blank: targetBlank ? 1 : 0 } );
	}

	function saveImage( id, key, attachmentId ) {
		return apiPost( 'image', { post_id: cfg.postId, element_id: id, key: key, attachment_id: attachmentId } );
	}

	function saveVideo( id, key, attachmentId, url, sourceType ) {
		return apiPost( 'video', {
			post_id:       cfg.postId,
			element_id:    id,
			key:           key,
			attachment_id: attachmentId || 0,
			url:           url || '',
			source_type:   sourceType || 'media'
		} );
	}

	function savePoster( id, key, attachmentId ) {
		return apiPost( 'poster', {
			post_id:       cfg.postId,
			element_id:    id,
			key:           key,
			attachment_id: attachmentId
		} );
	}

	function saveBackground( id, attachmentId, styleId, variantIndex, overlayIndex ) {
		return apiPost( 'background', {
			post_id:       cfg.postId,
			element_id:    id,
			attachment_id: attachmentId,
			style_id:      styleId,
			variant_index: variantIndex,
			overlay_index: overlayIndex
		} );
	}

	function saveGallery( id, key, action, attachmentId, index ) {
		return apiPost( 'gallery', {
			post_id:       cfg.postId,
			element_id:    id,
			key:           key,
			action:        action,
			attachment_id: attachmentId || 0,
			index:         index != null ? index : -1
		} );
	}

	function saveProGallery( id, key, action, attachmentId, oldAttachmentId, galleryIndex ) {
		return apiPost( 'pro-gallery', {
			post_id:           cfg.postId,
			element_id:        id,
			key:               key,
			action:            action,
			attachment_id:     attachmentId || 0,
			old_attachment_id: oldAttachmentId || 0,
			gallery_index:     galleryIndex != null ? galleryIndex : -1
		} );
	}

	function saveAttachmentMeta( attachmentId, field, value ) {
		return apiPost( 'attachment-meta', {
			attachment_id: attachmentId,
			field:         field,
			value:         value
		} );
	}

	function saveRepeaterItem( id, key, index, subField, value ) {
		return apiPost( 'repeater', {
			post_id:    cfg.postId,
			element_id: id,
			key:        key,
			index:      index,
			sub_field:  subField,
			value:      value
		} );
	}

	function deleteRepeaterItem( id, key, index ) {
		return apiPost( 'delete-repeater-item', {
			post_id:    cfg.postId,
			element_id: id,
			key:        key,
			index:      index
		} );
	}

	function addRepeaterItem( id, key, kind ) {
		return apiPost( 'add-repeater-item', {
			post_id:    cfg.postId,
			element_id: id,
			key:        key,
			kind:       kind || ''
		} );
	}

	function saveIcon( id, key, value, library ) {
		return apiPost( 'icon', {
			post_id:    cfg.postId,
			element_id: id,
			key:        key,
			value:      value,
			library:    library
		} );
	}

	function saveSetting( id, key, value ) {
		return apiPost( 'setting', {
			post_id:    cfg.postId,
			element_id: id,
			key:        key,
			value:      value
		} );
	}

	/* ----------------------------------------------------------------- */
	/* Icon picker                                                        */
	/* ----------------------------------------------------------------- */

	let iconPop = null;
	const iconCache = {};   // library -> array of icon names

	const ICON_LIBRARIES = {
		'fa-solid':   { displayPrefix: 'fas', url: cfg.elementorUrl + 'lib/font-awesome/js/solid.js' },
		'fa-regular': { displayPrefix: 'far', url: cfg.elementorUrl + 'lib/font-awesome/js/regular.js' },
		'fa-brands':  { displayPrefix: 'fab', url: cfg.elementorUrl + 'lib/font-awesome/js/brands.js' }
	};

	function loadIconLibrary( library ) {
		if ( iconCache[ library ] ) { return Promise.resolve( iconCache[ library ] ); }
		const conf = ICON_LIBRARIES[ library ];
		if ( ! conf ) { return Promise.resolve( [] ); }
		return fetch( conf.url ).then( function ( r ) { return r.json(); } ).then( function ( data ) {
			const icons = ( data && data.icons ) ? data.icons : [];
			iconCache[ library ] = icons;
			return icons;
		} ).catch( function () { return []; } );
	}

	function closeIconPop() {
		if ( iconPop && iconPop.parentNode ) { iconPop.parentNode.removeChild( iconPop ); }
		iconPop = null;
	}

	function openIconPop( currentLibrary, onPick ) {
		closeIconPop();
		iconPop = el( 'div', 'ri2-iconpop ri2-ui' );

		// Library tabs.
		const tabs = el( 'div', 'ri2-iconpop__tabs' );
		let activeLib = currentLibrary || 'fa-solid';
		const grid = el( 'div', 'ri2-iconpop__grid' );
		const search = el( 'input', 'ri2-iconpop__search' );
		search.type = 'text';
		search.placeholder = i18n.searchIcons || 'Search icons…';

		function renderGrid( library, filter ) {
			grid.innerHTML = '';
			const conf = ICON_LIBRARIES[ library ] || ICON_LIBRARIES['fa-solid'];
			loadIconLibrary( library ).then( function ( icons ) {
				const filtered = filter ? icons.filter( function ( name ) { return name.indexOf( filter ) !== -1; } ) : icons;
				filtered.slice( 0, 200 ).forEach( function ( name ) {
					const btn = el( 'button', 'ri2-iconpop__icon' );
					btn.type = 'button';
					btn.innerHTML = '<i class="' + conf.displayPrefix + ' fa-' + name + '"></i>';
					btn.title = name;
					btn.addEventListener( 'click', function () {
						const value = conf.displayPrefix + ' fa-' + name;
						closeIconPop();
						onPick( value, library );
					} );
					grid.appendChild( btn );
				} );
				if ( ! grid.children.length ) {
					grid.innerHTML = '<div class="ri2-iconpop__empty">' + ( i18n.noIcons || 'No icons found' ) + '</div>';
				}
			} );
		}

		Object.keys( ICON_LIBRARIES ).forEach( function ( lib ) {
			const tab = el( 'button', 'ri2-iconpop__tab' );
			tab.type = 'button';
			tab.textContent = lib.replace( 'fa-', '' ).charAt( 0 ).toUpperCase() + lib.slice( 3 );
			if ( lib === activeLib ) { tab.classList.add( 'is-active' ); }
			tab.addEventListener( 'click', function () {
				activeLib = lib;
				const siblings = tabs.querySelectorAll( '.ri2-iconpop__tab' );
				for ( let i = 0; i < siblings.length; i++ ) { siblings[ i ].classList.remove( 'is-active' ); }
				tab.classList.add( 'is-active' );
				renderGrid( lib, search.value.trim().toLowerCase() );
			} );
			tabs.appendChild( tab );
		} );

		search.addEventListener( 'input', function () {
			renderGrid( activeLib, search.value.trim().toLowerCase() );
		} );

		const closeBtn = el( 'button', 'ri2-iconpop__close' );
		closeBtn.type = 'button';
		closeBtn.innerHTML = '&times;';
		closeBtn.addEventListener( 'click', closeIconPop );

		iconPop.appendChild( closeBtn );
		iconPop.appendChild( tabs );
		iconPop.appendChild( search );
		iconPop.appendChild( grid );
		document.body.appendChild( iconPop );
		renderGrid( activeLib, '' );
		search.focus();
	}

	function replaceIcon( widget, opts ) {
		const id = widgetId( widget );
		getFields( id ).then( function ( res ) {
			let iconField, currentLib, saveFn;

			if ( opts && opts.itemIndex != null && opts.key ) {
				// Repeater item (icon-list or social-icons).
				const repKind = opts.kind || 'icon-list';
				const listField = ( res.fields || [] ).filter( function ( f ) { return f.key === opts.key && repKind === f.kind; } )[ 0 ];
				if ( ! listField || ! listField.items ) {
					toast( i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}
				const item = listField.items[ opts.itemIndex ];
				if ( ! item ) {
					toast( i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}
				currentLib = item.icon ? item.icon.library : '';
				const iconSubField = 'social-icons' === repKind ? 'social_icon' : 'selected_icon';
				saveFn = function ( value, library ) {
					return saveRepeaterItem( id, opts.key, opts.itemIndex, iconSubField, { value: value, library: library } );
				};
			} else {
				// Single icon field (icon-box widget).
				iconField = ( res.fields || [] ).filter( function ( f ) { return 'icon' === f.kind; } )[ 0 ];
				if ( ! iconField ) {
					toast( i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}
				currentLib = iconField.library;
				saveFn = function ( value, library ) {
					return saveIcon( id, iconField.key, value, library );
				};
			}

			openIconPop( currentLib, function ( value, library ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				saveFn( value, library )
					.then( function () {
						delete fieldsCache[ id ];
						return refreshWidget( widget );
					} )
					.then( function () {
						toast( i18n.saved || 'Saved', 'ok' );
					} )
					.catch( function ( err ) {
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			} );
		} );
	}

	function refreshWidget( widget ) {
		const id = widgetId( widget );
		// Capture the resolved type before replacement. Atomic widgets render
		// with data-e-type="widget" (the generic Widget_Base type), so we need
		// to restore the real atomic type (e.g. "e-image") on the new element.
		const prevType = widgetType( widget );
		delete fieldsCache[ id ];
		return apiGet( 'render?post_id=' + cfg.postId + '&element_id=' + encodeURIComponent( id ) )
			.then( function ( r ) {
				if ( ! r || ! r.html ) { return; }
				const tmp = document.createElement( 'div' );
				tmp.innerHTML = r.html.trim();
				const rendered = tmp.firstElementChild;
				if ( ! rendered ) { return; }
				// Ensure the rendered element has the attributes the frontend JS
				// needs to discover it: data-id, data-e-type, data-widget_type.
				if ( ! rendered.getAttribute( 'data-id' ) ) {
					rendered.setAttribute( 'data-id', id );
				}
				// Elementor sets data-e-type to the generic "widget" for atomic
				// widgets. Overwrite it with the real atomic type so the
				// per-handler mouseover listeners and widgetType() work.
				var rawEType = rendered.getAttribute( 'data-e-type' ) || '';
				if ( prevType && ( ! rawEType || 'widget' === rawEType ) ) {
					rendered.setAttribute( 'data-e-type', prevType );
				}
				if ( ! rendered.getAttribute( 'data-widget_type' ) ) {
					var wt = rendered.getAttribute( 'data-e-type' ) || prevType;
					if ( wt ) { rendered.setAttribute( 'data-widget_type', wt ); }
				}
				var parent = widget.parentNode;
				if ( ! parent ) { return; }
				parent.replaceChild( rendered, widget );
				if ( window.elementorFrontend && window.elementorFrontend.elementsHandler ) {
					try { elementorFrontend.elementsHandler.runReadyTrigger( rendered ); } catch ( e ) {}
				}
				// Reset hover state so the new widget gets onHover on next mouseover.
				hoveredWidget = null;
				return rendered;
			} );
	}

	/* ----------------------------------------------------------------- */
	/* Toast                                                              */
	/* ----------------------------------------------------------------- */

	let bar, toastEl, toastTimer;

	function buildChrome() {
		bar = el( 'div', 'ri2-bar' );
		const label = el( 'span', 'ri2-bar__label', '<span class="dashicons dashicons-edit-page"></span> ' + ( i18n.editing || 'Editing' ) );
		toastEl = el( 'span', 'ri2-bar__toast' );
		const exit = el( 'button', 'ri2-bar__exit' );
		exit.type = 'button';
		exit.textContent = i18n.exit || 'Exit';
		exit.addEventListener( 'click', function () { deactivate(); } );
		bar.appendChild( label );
		bar.appendChild( toastEl );
		bar.appendChild( exit );
		document.body.appendChild( bar );
	}

	function toast( msg, state ) {
		if ( ! toastEl ) { return; }
		toastEl.textContent = msg;
		toastEl.className = 'ri2-bar__toast is-visible' + ( state ? ' is-' + state : '' );
		clearTimeout( toastTimer );
		if ( 'saving' !== state ) {
			toastTimer = setTimeout( function () { toastEl.className = 'ri2-bar__toast'; }, 1800 );
		}
	}

	/* ----------------------------------------------------------------- */
	/* Activation                                                         */
	/* ----------------------------------------------------------------- */

	function activate() {
		if ( active ) { return; }
		active = true;
		document.body.classList.add( 'ri2-active' );
		if ( ! bar ) { buildChrome(); }
		bar.classList.add( 'is-visible' );
	}

	function deactivate() {
		if ( ! active ) { return; }
		commitSession();
		active = false;
		document.body.classList.remove( 'ri2-active' );
		if ( bar ) { bar.classList.remove( 'is-visible' ); }
		hideButton();
	}

	function toggle() { active ? deactivate() : activate(); }

	document.addEventListener( 'click', function ( e ) {
		const t = e.target.closest && e.target.closest( '#wp-admin-bar-roman-inline-2-toggle' );
		if ( t ) { e.preventDefault(); toggle(); }
	} );

	/* ----------------------------------------------------------------- */
	/* Click + hover delegation                                           */
	/* ----------------------------------------------------------------- */

	document.addEventListener( 'click', function ( e ) {
		if ( ! active ) { return; }
		if ( e.target.closest( '.ri2-ui' ) || e.target.closest( '#wpadminbar' ) ) { return; }

		// If already editing and the click is inside the current edit node,
		// let the browser handle text selection normally.
		if ( session && session.node && session.node.contains( e.target ) ) {
			return;
		}

		const widget = widgetOf( e.target );
		if ( ! widget ) {
			return;
		}

		const anchor = e.target.closest( 'a' );
		if ( anchor && widget.contains( anchor ) ) { e.preventDefault(); }

		const type = widgetType( widget );
		const handler = H[ type ];
		if ( handler && handler.onClick ) {
			handler.onClick( e, widget, createContext( widget ) );
		} else {
			toast( i18n.nothingEditable || 'Nothing editable here', 'error' );
		}
	}, true );

	let hoveredWidget = null;

	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! active ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		const type = widgetType( widget );
		const handler = H[ type ];
		if ( ! handler ) { return; }

		if ( hoveredWidget !== widget ) {
			clearTimeout( hoverLeaveTimer );
			if ( hoveredWidget ) {
				const prevType = widgetType( hoveredWidget );
				const prevHandler = H[ prevType ];
				if ( prevHandler && prevHandler.onLeave ) {
					prevHandler.onLeave( e, hoveredWidget, createContext( hoveredWidget ) );
				}
			}
			hoveredWidget = widget;
			if ( handler.onHover ) {
				handler.onHover( e, widget, createContext( widget ) );
			}
		}
	} );

	let hoverLeaveTimer = null;

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! active || ! hoveredWidget ) { return; }
		if ( e.relatedTarget && hoveredWidget.contains( e.relatedTarget ) ) { return; }
		// Delay onLeave slightly so quick transitions between child elements
		// or overlay don't cause flicker.
		clearTimeout( hoverLeaveTimer );
		hoverLeaveTimer = setTimeout( function () {
			if ( ! hoveredWidget ) { return; }
			const type = widgetType( hoveredWidget );
			const handler = H[ type ];
			if ( handler && handler.onLeave ) {
				handler.onLeave( e, hoveredWidget, createContext( hoveredWidget ) );
			}
			hoveredWidget = null;
		}, 100 );
	} );

	/* ----------------------------------------------------------------- */
	/* Edit session — text                                                */
	/* ----------------------------------------------------------------- */

	function startTextEdit( widget, node, opts ) {
		commitSession();

		node.setAttribute( 'contenteditable', 'true' );
		node.classList.add( 'ri2-editing' );

		session = {
			type:      'text',
			widget:    widget,
			node:      node,
			key:       opts.key,
			kind:      opts.kind || 'rich_text',
			isAtomic:  opts.isAtomic,
			original:  node.innerHTML,
			fieldMap:  opts.fieldMap || null,
			itemIndex: opts.itemIndex != null ? opts.itemIndex : null,
			subField:   opts.subField || null,
			attachmentMeta: opts.attachmentMeta || null
		};

		node.focus();
		placeCaretEnd( node );
		showToolbar( node, opts.kind !== 'text' );
	}

	function commitSession() {
		if ( ! session ) { return; }
		const s = session;
		session = null;

		if ( 'text' === s.type ) {
			s.node.removeAttribute( 'contenteditable' );
			s.node.classList.remove( 'ri2-editing' );
			hideToolbar();

			const raw = s.node.innerHTML;
			if ( raw === s.original ) {
				if ( s.linkChanged ) {
					refreshWidget( s.widget );
				}
				return;
			}

			const value = ( 'rich_text' === s.kind ) ? raw : raw.trim();
			toast( i18n.saving || 'Saving…', 'saving' );

			let savePromise;
			if ( s.attachmentMeta ) {
				savePromise = saveAttachmentMeta( s.attachmentMeta.attachmentId, s.attachmentMeta.field, value );
			} else if ( s.itemIndex != null && s.subField ) {
				savePromise = saveRepeaterItem( widgetId( s.widget ), s.key, s.itemIndex, s.subField, value );
			} else {
				savePromise = saveText( widgetId( s.widget ), s.key, value, s.kind );
			}

			savePromise
				.then( function ( r ) {
					toast( i18n.saved || 'Saved', 'ok' );
					if ( s.fieldMap ) { s.fieldMap.value = ( r && r.value ) != null ? r.value : value; }
					if ( s.linkChanged ) {
						refreshWidget( s.widget );
					}
				} )
				.catch( function ( err ) {
					s.node.innerHTML = s.original;
					toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
				} );
		}
	}

	function cancelSession() {
		if ( ! session ) { return; }
		const s = session;
		session = null;

		if ( 'text' === s.type ) {
			s.node.innerHTML = s.original;
			s.node.removeAttribute( 'contenteditable' );
			s.node.classList.remove( 'ri2-editing' );
			hideToolbar();
			if ( s.linkChanged ) {
				refreshWidget( s.widget );
			}
		}
	}

	function placeCaretEnd( node ) {
		try {
			const range = document.createRange();
			range.selectNodeContents( node );
			range.collapse( false );
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange( range );
		} catch ( e ) {}
	}

	document.addEventListener( 'mousedown', function ( e ) {
		if ( ! session ) { return; }
		if ( e.target.closest( '.ri2-toolbar' ) ) { return; }
		if ( e.target.closest( '.ri2-linkpop' ) ) { return; }
		if ( e.target.closest( '.ri2-vidpop' ) ) { return; }
		if ( session.node && session.node.contains( e.target ) ) { return; }
		commitSession();
	} );

	// Close any open popover when clicking outside it.
	document.addEventListener( 'mousedown', function ( e ) {
		if ( e.target.closest( '.ri2-linkpop' ) ) { return; }
		if ( e.target.closest( '.ri2-vidpop' ) ) { return; }
		if ( e.target.closest( '.ri2-carousel-actions' ) ) { return; }
		closeLinkPop();
		closeVideoPopover();
	} );

	document.addEventListener( 'keydown', function ( e ) {
		if ( ! session ) { return; }
		if ( 'Escape' === e.key ) { e.preventDefault(); cancelSession(); }
		if ( 'Enter' === e.key && ! e.shiftKey && 'rich_text' !== session.kind ) {
			e.preventDefault();
			commitSession();
		}
	} );

	/* ----------------------------------------------------------------- */
	/* Toolbar                                                            */
	/* ----------------------------------------------------------------- */

	let toolbar;

	function tbButton( label, icon, handler ) {
		const b = el( 'button', 'ri2-toolbar__btn' );
		b.type = 'button';
		b.title = label;
		b.innerHTML = '<span class="dashicons dashicons-' + icon + '"></span>';
		b.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		b.addEventListener( 'click', function ( e ) { e.preventDefault(); handler(); } );
		return b;
	}

	function showToolbar( node, showLink ) {
		hideToolbar();
		toolbar = el( 'div', 'ri2-toolbar ri2-ui' );
		toolbar.appendChild( tbButton( i18n.bold || 'Bold', 'editor-bold', function () { exec( 'bold' ); } ) );
		toolbar.appendChild( tbButton( i18n.italic || 'Italic', 'editor-italic', function () { exec( 'italic' ); } ) );
		var hasLinkField = showLink || ( session && session.fieldMap && ( session.fieldMap.fields || [] ).some( function ( f ) { return 'link' === f.kind; } ) );
		if ( hasLinkField ) {
			toolbar.appendChild( tbButton( i18n.link || 'Link', 'admin-links', onToolbarLink ) );
		}
		const done = el( 'button', 'ri2-toolbar__done' );
		done.type = 'button';
		done.textContent = i18n.done || 'Done';
		done.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		done.addEventListener( 'click', function () { commitSession(); } );
		toolbar.appendChild( done );
		document.body.appendChild( toolbar );
		positionToolbar();
	}

	function hideToolbar() {
		if ( toolbar && toolbar.parentNode ) { toolbar.parentNode.removeChild( toolbar ); }
		toolbar = null;
		closeLinkPop();
	}

	function positionToolbar() {
		if ( ! toolbar || ! session ) { return; }
		const r = session.node.getBoundingClientRect();
		let top = r.top - toolbar.offsetHeight - 8;
		if ( top < 4 ) { top = r.bottom + 8; }
		toolbar.style.top = Math.max( 4, top ) + 'px';
		toolbar.style.left = Math.max( 4, r.left ) + 'px';
	}
	window.addEventListener( 'scroll', positionToolbar, true );
	window.addEventListener( 'resize', positionToolbar );

	function exec( cmd, val ) {
		document.execCommand( cmd, false, val || null );
		if ( session ) { session.node.focus(); }
	}

	/* ----------------------------------------------------------------- */
	/* Link editing                                                       */
	/* ----------------------------------------------------------------- */

	let linkPop;

	function onToolbarLink() {
		const sel = window.getSelection();
		const hasSelection = sel && ! sel.isCollapsed && session && session.node.contains( sel.anchorNode );

		if ( hasSelection ) {
			openLinkPop( '', false, function ( url, blank ) {
				if ( url ) {
					exec( 'createLink', url );
					if ( blank ) {
						const a = session.node.querySelector( 'a[href="' + url.replace( /"/g, '\\"' ) + '"]' );
						if ( a ) { a.target = '_blank'; a.rel = 'noopener'; }
					}
				} else {
					exec( 'unlink' );
				}
			} );
			return;
		}

		if ( ! session.fieldMap ) { return; }
		const linkField = ( session.fieldMap.fields || [] ).filter( function ( f ) { return 'link' === f.kind; } )[ 0 ];
		if ( ! linkField ) {
			openLinkPop( '', false, function ( url ) { if ( url ) { exec( 'createLink', url ); } } );
			return;
		}
		openLinkPop( linkField.value || '', !! linkField.target_blank, function ( url, blank ) {
			toast( i18n.saving || 'Saving…', 'saving' );
			const wid = widgetId( session.widget );
			saveLink( wid, linkField.key, url, blank )
				.then( function () {
					linkField.value = url;
					linkField.target_blank = blank;
					delete fieldsCache[ wid ];
					if ( session ) { session.linkChanged = true; }
					toast( i18n.saved || 'Saved', 'ok' );
				} )
				.catch( function ( err ) {
					toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
				} );
		} );
	}

	function openLinkPop( url, blank, onApply, anchorRect ) {
		closeLinkPop();
		linkPop = el( 'div', 'ri2-linkpop ri2-ui' );
		const input = el( 'input', 'ri2-linkpop__url' );
		input.type = 'url';
		input.placeholder = 'https://…';
		input.value = url || '';
		const lbl = el( 'label', 'ri2-linkpop__check' );
		const cb = el( 'input' );
		cb.type = 'checkbox';
		cb.checked = !! blank;
		lbl.appendChild( cb );
		lbl.appendChild( document.createTextNode( ' ' + ( i18n.newTab || 'New tab' ) ) );
		const apply = el( 'button', 'ri2-linkpop__apply' );
		apply.type = 'button';
		apply.textContent = i18n.done || 'Apply';
		apply.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		apply.addEventListener( 'click', function () {
			onApply( input.value.trim(), cb.checked );
			closeLinkPop();
		} );
		linkPop.appendChild( input );
		linkPop.appendChild( lbl );
		linkPop.appendChild( apply );
		document.body.appendChild( linkPop );
		if ( anchorRect ) {
			const lpW = linkPop.offsetWidth;
			const lpH = linkPop.offsetHeight;
			let top = anchorRect.bottom + 4;
			let left = anchorRect.left + ( anchorRect.width - lpW ) / 2;
			if ( top + lpH > window.innerHeight - 4 ) { top = anchorRect.top - lpH - 4; }
			if ( top < 4 ) { top = 4; }
			if ( left < 4 ) { left = 4; }
			if ( left + lpW > window.innerWidth - 4 ) { left = window.innerWidth - lpW - 4; }
			linkPop.style.top = top + 'px';
			linkPop.style.left = left + 'px';
		} else if ( toolbar ) {
			const r = toolbar.getBoundingClientRect();
			linkPop.style.top = ( r.bottom + 6 ) + 'px';
			linkPop.style.left = r.left + 'px';
		} else {
			// No toolbar — position near the center-top of the viewport.
			linkPop.style.top = '80px';
			linkPop.style.left = '50%';
			linkPop.style.transform = 'translateX( -50% )';
		}
		input.focus();
	}

	function closeLinkPop() {
		if ( linkPop && linkPop.parentNode ) { linkPop.parentNode.removeChild( linkPop ); }
		linkPop = null;
	}

	/* ----------------------------------------------------------------- */
	/* Media frame                                                        */
	/* ----------------------------------------------------------------- */

	function openMedia( opts ) {
		const frame = wp.media( {
			title:   opts.title || ( i18n.chooseImg || 'Choose image' ),
			button:  { text: opts.buttonText || ( i18n.replaceImg || 'Replace image' ) },
			library: { type: 'image' },
			multiple: false
		} );

		frame.on( 'select', function () {
			const attachment = frame.state().get( 'selection' ).first().toJSON();
			if ( opts.onSelect ) { opts.onSelect( attachment ); }
		} );

		frame.open();
	}

	function openGalleryMedia( opts ) {
		const frame = wp.media( {
			title:   opts.title || 'Add images to gallery',
			button:  { text: opts.buttonText || 'Add images' },
			library: { type: 'image' },
			multiple: 'add'
		} );

		frame.on( 'select', function () {
			const selection = frame.state().get( 'selection' );
			const attachments = [];
			selection.map( function ( model ) {
				attachments.push( model.toJSON() );
			} );
			if ( opts.onSelect && attachments.length ) {
				opts.onSelect( attachments );
			}
		} );

		frame.open();
	}

	/* ----------------------------------------------------------------- */
	/* Video media frame                                                  */
	/* ----------------------------------------------------------------- */

	function openVideoMedia( opts ) {
		const frame = wp.media( {
			title:   opts.title || ( i18n.chooseVideo || 'Choose video' ),
			button:  { text: opts.buttonText || ( i18n.chooseVideo || 'Choose video' ) },
			library: { type: 'video' },
			multiple: false
		} );

		frame.on( 'select', function () {
			const attachment = frame.state().get( 'selection' ).first().toJSON();
			if ( opts.onSelect ) { opts.onSelect( attachment ); }
		} );

		frame.open();
	}

	/* ----------------------------------------------------------------- */
	/* Video URL popover                                                  */
	/* ----------------------------------------------------------------- */

	let vidPop;

	function openVideoPopover( field, onSave ) {
		closeVideoPopover();
		vidPop = el( 'div', 'ri2-vidpop ri2-ui' );
		const inner = el( 'div', 'ri2-vidpop__inner' );
		inner.appendChild( el( 'div', 'ri2-vidpop__title', field.label || 'Video URL' ) );
		const row = el( 'div', 'ri2-vidpop__row' );
		const input = el( 'input', 'ri2-vidpop__input' );
		input.type = 'url';
		input.value = field.value || '';
		input.placeholder = 'https://';
		row.appendChild( input );
		inner.appendChild( row );

		const actions = el( 'div', 'ri2-vidpop__actions' );
		const save = el( 'button', 'ri2-vidpop__save' );
		save.type = 'button';
		save.textContent = i18n.done || 'Save';
		const cancel = el( 'button', 'ri2-vidpop__cancel' );
		cancel.type = 'button';
		cancel.textContent = i18n.cancel || 'Cancel';
		cancel.addEventListener( 'click', closeVideoPopover );
		save.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		save.addEventListener( 'click', function () {
			onSave( input.value.trim() );
			closeVideoPopover();
		} );
		actions.appendChild( cancel );
		actions.appendChild( save );
		inner.appendChild( actions );
		vidPop.appendChild( inner );
		document.body.appendChild( vidPop );
		input.focus();
	}

	function closeVideoPopover() {
		if ( vidPop && vidPop.parentNode ) { vidPop.parentNode.removeChild( vidPop ); }
		vidPop = null;
	}

	/* ----------------------------------------------------------------- */
	/* Floating button (for image hover, etc.)                            */
	/* ----------------------------------------------------------------- */

	let floatBtn;

	function showButton( rect, text, icon, onClick ) {
		if ( ! floatBtn ) {
			floatBtn = el( 'button', 'ri2-floatbtn ri2-ui' );
			floatBtn.type = 'button';
			document.body.appendChild( floatBtn );
		}
		floatBtn.innerHTML = '<span class="dashicons dashicons-' + icon + '"></span> ' + text;
		floatBtn.onclick = function ( e ) { e.preventDefault(); onClick(); };
		floatBtn.style.top = ( rect.top + 8 ) + 'px';
		floatBtn.style.left = ( rect.left + 8 ) + 'px';
		floatBtn.classList.add( 'is-visible' );
	}

	function hideButton() {
		if ( floatBtn ) { floatBtn.classList.remove( 'is-visible' ); }
	}

	/* ----------------------------------------------------------------- */
	/* High-level edit methods (used by handlers)                         */
	/* ----------------------------------------------------------------- */

	function editText( widget, node, opts ) {
		const id = widgetId( widget );
		getFields( id ).then( function ( res ) {
			let kind = opts.kind;
			if ( ! kind ) {
				const matched = ( res.fields || [] ).filter( function ( f ) { return f.key === opts.key; } )[ 0 ];
				kind = matched ? matched.kind : 'rich_text';
			}
			startTextEdit( widget, node, {
				key:        opts.key,
				kind:       kind,
				isAtomic:   opts.isAtomic != null ? opts.isAtomic : res.is_atomic,
				fieldMap:   res,
				itemIndex: opts.itemIndex,
				subField:   opts.subField
			} );
		} );
	}

	function editAttachmentText( widget, node, opts ) {
		startTextEdit( widget, node, {
			key:            '__attachment_meta__',
			kind:           opts.kind || 'text',
			attachmentMeta: {
				attachmentId: opts.attachmentId,
				field:        opts.field
			}
		} );
	}

	function editLink( widget, node, opts ) {
		const id = widgetId( widget );
		getFields( id ).then( function ( res ) {
			let linkField, linkValue, linkBlank;
			if ( opts.itemIndex != null && opts.key ) {
				const repField = ( res.fields || [] ).filter( function ( f ) { return f.key === opts.key && ( 'repeater' === f.kind || 'icon-list' === f.kind || 'social-icons' === f.kind ); } )[ 0 ];
				if ( ! repField ) { return; }
				const repItems = repField.items || [];
				const repItem = repItems[ opts.itemIndex ];
				if ( ! repItem ) { return; }
				var linkKey = opts.linkKey || 'link';
				linkValue = ( repItem[ linkKey ] && repItem[ linkKey ].url ) || '';
				linkBlank = !! ( repItem[ linkKey ] && repItem[ linkKey ].is_external );
				linkField = { key: opts.key, value: linkValue, target_blank: linkBlank };
			} else {
				linkField = ( res.fields || [] ).filter( function ( f ) { return 'link' === f.kind; } )[ 0 ];
				if ( ! linkField ) { return; }
				linkValue = linkField.value || '';
				linkBlank = !! linkField.target_blank;
			}
			const anchorRect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
		openLinkPop( opts.url || linkValue, !! ( opts.targetBlank != null ? opts.targetBlank : linkBlank ), function ( url, blank ) {
				toast( i18n.saving || 'Saving…', 'saving' );
					let savePromise;
					if ( opts.itemIndex != null && opts.subField ) {
					savePromise = saveRepeaterItem( id, opts.key, opts.itemIndex, opts.subField, { url: url, is_external: blank, nofollow: false } );
				} else {
					savePromise = saveLink( id, linkField.key, url, blank );
				}
				savePromise
					.then( function () {
						linkField.value = url;
						linkField.target_blank = blank;
						delete fieldsCache[ id ];
						toast( i18n.saved || 'Saved', 'ok' );
						const a = node.querySelector( 'a' ) || ( node.tagName === 'A' ? node : null );
						if ( a ) {
							if ( url ) { a.setAttribute( 'href', url ); }
							if ( blank ) { a.target = '_blank'; a.rel = 'noopener'; }
						}
					} )
					.catch( function ( err ) {
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			}, anchorRect );
		} );
	}

	function replaceImage( widget, imgNode, opts ) {
		const id = widgetId( widget );
		openMedia( {
			onSelect: function ( attachment ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				saveImage( id, opts.key, attachment.id )
					.then( function () {
						delete fieldsCache[ id ];
						return refreshWidget( widget );
					} )
					.then( function () {
						toast( i18n.saved || 'Saved', 'ok' );
					} )
					.catch( function ( err ) {
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			}
		} );
	}

	function replaceVideo( widget, opts ) {
		const id = widgetId( widget );
		const sourceType = opts.source_type || 'media';

		if ( 'media' === sourceType ) {
			openVideoMedia( {
				onSelect: function ( attachment ) {
					toast( i18n.saving || 'Saving…', 'saving' );
					saveVideo( id, opts.key, attachment.id, '', sourceType )
						.then( function () {
							delete fieldsCache[ id ];
							return refreshWidget( widget );
						} )
						.then( function () {
							toast( i18n.saved || 'Saved', 'ok' );
						} )
						.catch( function ( err ) {
							toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
						} );
				}
			} );
		} else {
			openVideoPopover( opts, function ( url ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				saveVideo( id, opts.key, 0, url, sourceType )
					.then( function () {
						delete fieldsCache[ id ];
						return refreshWidget( widget );
					} )
					.then( function () {
						toast( i18n.saved || 'Saved', 'ok' );
					} )
					.catch( function ( err ) {
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			} );
		}
	}

	function replacePoster( widget, opts ) {
		const id = widgetId( widget );
		openMedia( {
			onSelect: function ( attachment ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				savePoster( id, opts.key, attachment.id )
					.then( function () {
						delete fieldsCache[ id ];
						return refreshWidget( widget );
					} )
					.then( function () {
						toast( i18n.saved || 'Saved', 'ok' );
					} )
					.catch( function ( err ) {
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			}
		} );
	}

	function replaceBackground( widget, opts ) {
		const id = widgetId( widget );
		openMedia( {
			onSelect: function ( attachment ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				// Snapshot for rollback.
				const prevBg = widget.style.backgroundImage;
				saveBackground( id, attachment.id, opts.style_id, opts.variant_index, opts.overlay_index )
					.then( function ( res ) {
						delete fieldsCache[ id ];
						// Optimistic inline background — the saved class CSS takes over on reload.
						// Only update the image; let Elementor's CSS control size, position, repeat.
						if ( res && res.value ) {
							widget.style.backgroundImage = 'url("' + res.value + '")';
						}
						toast( i18n.saved || 'Saved', 'ok' );
					} )
					.catch( function ( err ) {
						widget.style.backgroundImage = prevBg;
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			}
		} );
	}

	/* ----------------------------------------------------------------- */
	/* Context factory                                                    */
	/* ----------------------------------------------------------------- */

	function createContext( widget ) {
		const id    = widgetId( widget );
		const type  = widgetType( widget );
		const atomic = isAtomic( widget );

		return {
			getFields:     function () { return getFields( id ); },
			editText:      function ( node, opts ) { return editText( widget, node, opts ); },
			editLink:      function ( node, opts ) { return editLink( widget, node, opts ); },
			replaceImage:  function ( node, opts ) { return replaceImage( widget, node, opts ); },
			replaceVideo:  function ( node, opts ) { return replaceVideo( widget, opts ); },
			replacePoster: function ( opts ) { return replacePoster( widget, opts ); },
			replaceBackground: function ( opts ) { return replaceBackground( widget, opts ); },
			replaceIcon:    function ( opts ) { return replaceIcon( widget, opts ); },
			saveIcon:       function ( key, value, library ) { return saveIcon( id, key, value, library ); },
			saveSetting:    function ( key, value ) { return saveSetting( id, key, value ); },
			saveText:      function ( key, value, kind ) { return saveText( id, key, value, kind ); },
			saveLink:      function ( key, url, blank ) { return saveLink( id, key, url, blank ); },
			saveImage:     function ( key, attId ) { return saveImage( id, key, attId ); },
			saveVideo:     function ( key, attId, url, srcType ) { return saveVideo( id, key, attId, url, srcType ); },
			savePoster:    function ( key, attId ) { return savePoster( id, key, attId ); },
			saveBackground: function ( attId, styleId, vi, oi ) { return saveBackground( id, attId, styleId, vi, oi ); },
			saveGallery:   function ( key, action, attId, idx ) { return saveGallery( id, key, action, attId, idx ); },
			saveProGallery: function ( key, action, attId, oldAttId, galIdx ) { return saveProGallery( id, key, action, attId, oldAttId, galIdx ); },
			saveAttachmentMeta: saveAttachmentMeta,
			saveRepeaterItem: function ( key, index, subField, value ) { return saveRepeaterItem( id, key, index, subField, value ); },
			deleteRepeaterItem: function ( key, index ) { return deleteRepeaterItem( id, key, index ); },
			addRepeaterItem:  function ( key, kind ) { return addRepeaterItem( id, key, kind ); },
			refreshWidget: function () { return refreshWidget( widget ); },
			toast:         toast,
			showButton:    showButton,
			hideButton:    hideButton,
			openMedia:     openMedia,
			openGalleryMedia: openGalleryMedia,
			openVideoMedia: openVideoMedia,
			locateNode:    locateNode,
			preferTextNode: preferTextNode,
			buildSelector: buildSelector,
			widgetId:      id,
			widgetType:    type,
			isAtomic:      atomic,
			cfg:           cfg,
			i18n:          i18n
		};
	}

	/* ----------------------------------------------------------------- */
	/* Public API                                                         */
	/* ----------------------------------------------------------------- */

	window.RomanInline2 = {
		register:  function ( type, handler ) {
			H[ type ] = handler;
		},
		isActive:  function () { return active; },
		hasSession: function () { return !! session; },
		ctx:       createContext,
		cfg:       cfg,
		i18n:      i18n,
		_editAttachmentText: editAttachmentText
	};


} )( window.wp, window.jQuery );
