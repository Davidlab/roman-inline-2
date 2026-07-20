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

	var cfg   = window.romanInline2;
	var i18n  = cfg.i18n || {};
	var H     = {};          // registered handlers: type -> handler
	var active = false;
	var session = null;      // current edit session
	var fieldsCache = {};    // elementId -> fields response

	wp.apiFetch.use( wp.apiFetch.createNonceMiddleware( cfg.nonce ) );

	/* ----------------------------------------------------------------- */
	/* DOM helpers                                                        */
	/* ----------------------------------------------------------------- */

	function el( tag, cls, html ) {
		var n = document.createElement( tag );
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

	var WIDGET_SELECTOR = '.elementor-widget[data-id], [data-e-type][data-id], .e-con[data-id], .elementor-section[data-id]';

	function widgetOf( node ) {
		return node.closest ? node.closest( WIDGET_SELECTOR ) : null;
	}

	function widgetId( widget ) {
		return widget.getAttribute( 'data-id' );
	}

	function widgetType( widget ) {
		var wt = widget.getAttribute( 'data-widget_type' ) || '';
		var et = widget.getAttribute( 'data-e-type' ) || '';

		// data-widget_type has the specific type (e.g. "heading.default").
		if ( wt ) {
			return wt.split( '.' )[ 0 ];
		}

		// data-e-type has the atomic type (e.g. "e-heading") or generic "widget".
		if ( et && 'widget' !== et ) {
			return et;
		}

		// Atomic widgets often put the type in a class like "e-heading-base".
		var cls = widget.className || '';
		var m = cls.match( /\be-([a-z]+)-base\b/ );
		if ( m ) {
			return 'e-' + m[ 1 ];
		}

		return '';
	}

	function isAtomic( widget ) {
		var et = widget.getAttribute( 'data-e-type' ) || '';
		return et.indexOf( 'e-' ) === 0;
	}

	/* ----------------------------------------------------------------- */
	/* Node location (classic widgets)                                    */
	/* ----------------------------------------------------------------- */

	function buildSelector( match ) {
		var sel = match.tag || '*';
		( match.classes || [] ).forEach( function ( c ) { sel += '.' + cssEscape( c ); } );
		return sel;
	}

	// If a node's entire content is a single <a> wrapper (e.g. a linked
	// heading), edit the text inside the link rather than the wrapper itself.
	function preferTextNode( node ) {
		if ( ! node ) { return node; }
		var kids = node.children;
		if ( 1 === kids.length && 'A' === kids[ 0 ].tagName &&
			( kids[ 0 ].textContent || '' ).trim() === ( node.textContent || '' ).trim() ) {
			return kids[ 0 ];
		}
		return node;
	}

	function locateNode( widget, field, clicked ) {
		if ( field.match ) {
			var sel = buildSelector( field.match );
			if ( clicked ) {
				var near = clicked.closest( sel );
				if ( near && widget.contains( near ) ) { return near; }
			}
			var found = widget.querySelector( sel );
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

	function refreshWidget( widget ) {
		var id = widgetId( widget );
		delete fieldsCache[ id ];
		return apiGet( 'render?post_id=' + cfg.postId + '&element_id=' + encodeURIComponent( id ) )
			.then( function ( r ) {
				if ( ! r || ! r.html ) { return; }
				var tmp = document.createElement( 'div' );
				tmp.innerHTML = r.html.trim();
				var rendered = tmp.firstElementChild;
				if ( ! rendered ) { return; }
				// Ensure the rendered element has data-id so we can find it later.
				if ( ! rendered.getAttribute( 'data-id' ) ) {
					rendered.setAttribute( 'data-id', id );
				}
				if ( ! rendered.getAttribute( 'data-widget_type' ) ) {
					var wt = rendered.getAttribute( 'data-e-type' ) || '';
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

	var bar, toastEl, toastTimer;

	function buildChrome() {
		bar = el( 'div', 'ri2-bar' );
		var label = el( 'span', 'ri2-bar__label', '<span class="dashicons dashicons-edit-page"></span> ' + ( i18n.editing || 'Editing' ) );
		toastEl = el( 'span', 'ri2-bar__toast' );
		var exit = el( 'button', 'ri2-bar__exit' );
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
		var t = e.target.closest && e.target.closest( '#wp-admin-bar-roman-inline-2-toggle' );
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

		var widget = widgetOf( e.target );
		if ( ! widget ) {
			return;
		}

		var anchor = e.target.closest( 'a' );
		if ( anchor && widget.contains( anchor ) ) { e.preventDefault(); }

		var type = widgetType( widget );
		var handler = H[ type ];
		if ( handler && handler.onClick ) {
			handler.onClick( e, widget, createContext( widget ) );
		} else {
			toast( i18n.nothingEditable || 'Nothing editable here', 'error' );
		}
	}, true );

	var hoveredWidget = null;

	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! active ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		var type = widgetType( widget );
		var handler = H[ type ];
		if ( ! handler ) { return; }

		if ( hoveredWidget !== widget ) {
			clearTimeout( hoverLeaveTimer );
			if ( hoveredWidget ) {
				var prevType = widgetType( hoveredWidget );
				var prevHandler = H[ prevType ];
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

	var hoverLeaveTimer = null;

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! active || ! hoveredWidget ) { return; }
		if ( e.relatedTarget && hoveredWidget.contains( e.relatedTarget ) ) { return; }
		// Delay onLeave slightly so quick transitions between child elements
		// or overlay don't cause flicker.
		clearTimeout( hoverLeaveTimer );
		hoverLeaveTimer = setTimeout( function () {
			if ( ! hoveredWidget ) { return; }
			var type = widgetType( hoveredWidget );
			var handler = H[ type ];
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
			type:     'text',
			widget:   widget,
			node:     node,
			key:      opts.key,
			kind:     opts.kind || 'rich_text',
			isAtomic: opts.isAtomic,
			original: node.innerHTML,
			fieldMap: opts.fieldMap || null
		};

		node.focus();
		placeCaretEnd( node );
		showToolbar( node, opts.kind !== 'text' );
	}

	function commitSession() {
		if ( ! session ) { return; }
		var s = session;
		session = null;

		if ( 'text' === s.type ) {
			s.node.removeAttribute( 'contenteditable' );
			s.node.classList.remove( 'ri2-editing' );
			hideToolbar();

			var raw = s.node.innerHTML;
			if ( raw === s.original ) { return; }

			var value = ( 'rich_text' === s.kind ) ? raw : raw.trim();
			toast( i18n.saving || 'Saving…', 'saving' );

			saveText( widgetId( s.widget ), s.key, value, s.kind )
				.then( function ( r ) {
					toast( i18n.saved || 'Saved', 'ok' );
					if ( s.fieldMap ) { s.fieldMap.value = ( r && r.value ) != null ? r.value : value; }
				} )
				.catch( function ( err ) {
					s.node.innerHTML = s.original;
					toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
				} );
		}
	}

	function cancelSession() {
		if ( ! session ) { return; }
		var s = session;
		session = null;

		if ( 'text' === s.type ) {
			s.node.innerHTML = s.original;
			s.node.removeAttribute( 'contenteditable' );
			s.node.classList.remove( 'ri2-editing' );
			hideToolbar();
		}
	}

	function placeCaretEnd( node ) {
		try {
			var range = document.createRange();
			range.selectNodeContents( node );
			range.collapse( false );
			var sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange( range );
		} catch ( e ) {}
	}

	document.addEventListener( 'mousedown', function ( e ) {
		if ( ! session ) { return; }
		if ( e.target.closest( '.ri2-toolbar' ) ) { return; }
		if ( e.target.closest( '.ri2-linkpop' ) ) { return; }
		if ( session.node && session.node.contains( e.target ) ) { return; }
		commitSession();
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

	var toolbar;

	function tbButton( label, icon, handler ) {
		var b = el( 'button', 'ri2-toolbar__btn' );
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
		if ( showLink ) {
			toolbar.appendChild( tbButton( i18n.link || 'Link', 'admin-links', onToolbarLink ) );
		}
		var done = el( 'button', 'ri2-toolbar__done' );
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
		var r = session.node.getBoundingClientRect();
		var top = r.top - toolbar.offsetHeight - 8;
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

	var linkPop;

	function onToolbarLink() {
		var sel = window.getSelection();
		var hasSelection = sel && ! sel.isCollapsed && session && session.node.contains( sel.anchorNode );

		if ( hasSelection ) {
			openLinkPop( '', false, function ( url, blank ) {
				if ( url ) {
					exec( 'createLink', url );
					if ( blank ) {
						var a = session.node.querySelector( 'a[href="' + url.replace( /"/g, '\\"' ) + '"]' );
						if ( a ) { a.target = '_blank'; a.rel = 'noopener'; }
					}
				} else {
					exec( 'unlink' );
				}
			} );
			return;
		}

		if ( ! session.fieldMap ) { return; }
		var linkField = ( session.fieldMap.fields || [] ).filter( function ( f ) { return 'link' === f.kind; } )[ 0 ];
		if ( ! linkField ) {
			openLinkPop( '', false, function ( url ) { if ( url ) { exec( 'createLink', url ); } } );
			return;
		}
		openLinkPop( linkField.value || '', !! linkField.target_blank, function ( url, blank ) {
			toast( i18n.saving || 'Saving…', 'saving' );
			saveLink( widgetId( session.widget ), linkField.key, url, blank )
				.then( function () {
					linkField.value = url;
					linkField.target_blank = blank;
					toast( i18n.saved || 'Saved', 'ok' );
				} )
				.catch( function ( err ) {
					toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
				} );
		} );
	}

	function openLinkPop( url, blank, onApply ) {
		closeLinkPop();
		linkPop = el( 'div', 'ri2-linkpop ri2-ui' );
		var input = el( 'input', 'ri2-linkpop__url' );
		input.type = 'url';
		input.placeholder = 'https://…';
		input.value = url || '';
		var lbl = el( 'label', 'ri2-linkpop__check' );
		var cb = el( 'input' );
		cb.type = 'checkbox';
		cb.checked = !! blank;
		lbl.appendChild( cb );
		lbl.appendChild( document.createTextNode( ' ' + ( i18n.newTab || 'New tab' ) ) );
		var apply = el( 'button', 'ri2-linkpop__apply' );
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
		if ( toolbar ) {
			var r = toolbar.getBoundingClientRect();
			linkPop.style.top = ( r.bottom + 6 ) + 'px';
			linkPop.style.left = r.left + 'px';
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
		var frame = wp.media( {
			title:   opts.title || ( i18n.chooseImg || 'Choose image' ),
			button:  { text: opts.buttonText || ( i18n.replaceImg || 'Replace image' ) },
			library: { type: 'image' },
			multiple: false
		} );

		frame.on( 'select', function () {
			var attachment = frame.state().get( 'selection' ).first().toJSON();
			if ( opts.onSelect ) { opts.onSelect( attachment ); }
		} );

		frame.open();
	}

	/* ----------------------------------------------------------------- */
	/* Video media frame                                                  */
	/* ----------------------------------------------------------------- */

	function openVideoMedia( opts ) {
		var frame = wp.media( {
			title:   opts.title || ( i18n.chooseVideo || 'Choose video' ),
			button:  { text: opts.buttonText || ( i18n.chooseVideo || 'Choose video' ) },
			library: { type: 'video' },
			multiple: false
		} );

		frame.on( 'select', function () {
			var attachment = frame.state().get( 'selection' ).first().toJSON();
			if ( opts.onSelect ) { opts.onSelect( attachment ); }
		} );

		frame.open();
	}

	/* ----------------------------------------------------------------- */
	/* Video URL popover                                                  */
	/* ----------------------------------------------------------------- */

	var vidPop;

	function openVideoPopover( field, onSave ) {
		closeVideoPopover();
		vidPop = el( 'div', 'ri2-vidpop ri2-ui' );
		var inner = el( 'div', 'ri2-vidpop__inner' );
		inner.appendChild( el( 'div', 'ri2-vidpop__title', field.label || 'Video URL' ) );
		var row = el( 'div', 'ri2-vidpop__row' );
		var input = el( 'input', 'ri2-vidpop__input' );
		input.type = 'url';
		input.value = field.value || '';
		input.placeholder = 'https://';
		row.appendChild( input );
		inner.appendChild( row );

		var actions = el( 'div', 'ri2-vidpop__actions' );
		var save = el( 'button', 'ri2-vidpop__save' );
		save.type = 'button';
		save.textContent = i18n.done || 'Save';
		var cancel = el( 'button', 'ri2-vidpop__cancel' );
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

	var floatBtn;

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
		var id = widgetId( widget );
		getFields( id ).then( function ( res ) {
			var kind = opts.kind;
			if ( ! kind ) {
				var matched = ( res.fields || [] ).filter( function ( f ) { return f.key === opts.key; } )[ 0 ];
				kind = matched ? matched.kind : 'rich_text';
			}
			startTextEdit( widget, node, {
				key:      opts.key,
				kind:     kind,
				isAtomic: opts.isAtomic != null ? opts.isAtomic : res.is_atomic,
				fieldMap: res
			} );
		} );
	}

	function editLink( widget, node, opts ) {
		var id = widgetId( widget );
		getFields( id ).then( function ( res ) {
			var linkField = ( res.fields || [] ).filter( function ( f ) { return 'link' === f.kind; } )[ 0 ];
			if ( ! linkField ) { return; }
			openLinkPop( opts.url || linkField.value || '', !! ( opts.targetBlank != null ? opts.targetBlank : linkField.target_blank ), function ( url, blank ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				saveLink( id, linkField.key, url, blank )
					.then( function () {
						linkField.value = url;
						linkField.target_blank = blank;
						toast( i18n.saved || 'Saved', 'ok' );
						var a = node.querySelector( 'a' ) || ( node.tagName === 'A' ? node : null );
						if ( a ) {
							if ( url ) { a.setAttribute( 'href', url ); }
							if ( blank ) { a.target = '_blank'; a.rel = 'noopener'; }
						}
					} )
					.catch( function ( err ) {
						toast( ( err && err.message ) || i18n.saveFailed || 'Save failed', 'error' );
					} );
			} );
		} );
	}

	function replaceImage( widget, imgNode, opts ) {
		var id = widgetId( widget );
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
		var id = widgetId( widget );
		var sourceType = opts.source_type || 'media';

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
		var id = widgetId( widget );
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
		var id = widgetId( widget );
		openMedia( {
			onSelect: function ( attachment ) {
				toast( i18n.saving || 'Saving…', 'saving' );
				// Snapshot for rollback.
				var prevBg = widget.style.backgroundImage;
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
		var id    = widgetId( widget );
		var type  = widgetType( widget );
		var atomic = isAtomic( widget );

		return {
			getFields:     function () { return getFields( id ); },
			editText:      function ( node, opts ) { return editText( widget, node, opts ); },
			editLink:      function ( node, opts ) { return editLink( widget, node, opts ); },
			replaceImage:  function ( node, opts ) { return replaceImage( widget, node, opts ); },
			replaceVideo:  function ( node, opts ) { return replaceVideo( widget, opts ); },
			replacePoster: function ( opts ) { return replacePoster( widget, opts ); },
			replaceBackground: function ( opts ) { return replaceBackground( widget, opts ); },
			saveText:      function ( key, value, kind ) { return saveText( id, key, value, kind ); },
			saveLink:      function ( key, url, blank ) { return saveLink( id, key, url, blank ); },
			saveImage:     function ( key, attId ) { return saveImage( id, key, attId ); },
			saveVideo:     function ( key, attId, url, srcType ) { return saveVideo( id, key, attId, url, srcType ); },
			savePoster:    function ( key, attId ) { return savePoster( id, key, attId ); },
			saveBackground: function ( attId, styleId, vi, oi ) { return saveBackground( id, attId, styleId, vi, oi ); },
			refreshWidget: function () { return refreshWidget( widget ); },
			toast:         toast,
			showButton:    showButton,
			hideButton:    hideButton,
			openMedia:     openMedia,
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
		ctx:       createContext,
		cfg:       cfg,
		i18n:      i18n
	};


} )( window.wp, window.jQuery );
