/**
 * Roman Inline 2 — Elementor Pro Gallery widget handler.
 *
 * Supports the Elementor Pro Gallery widget (widget name: 'gallery') in both
 * single and multiple gallery modes.
 *
 * Single mode:   settings.gallery = array of { id, url }
 * Multiple mode: settings.galleries = repeater with gallery_title + multiple_gallery
 *
 * Features:
 *   - Hover over widget shows "Add Image" button.
 *   - Hover over an individual gallery item shows "Replace" and "Delete" buttons.
 *   - Click on overlay title/description text to inline-edit attachment metadata.
 *   - Click on gallery filter title (multiple mode) to inline-edit gallery_title.
 *   - All image operations use the /pro-gallery REST endpoint.
 *   - Title/description edits use /attachment-meta endpoint.
 *   - Gallery title edits use /slides endpoint (repeater sub_field='gallery_title').
 *
 * Uses direct document-level mouseover/mouseout (like gallery.js handler).
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var addBtn = null;
	var addBtnWidget = null;
	var imgBtns = [];
	var leaveTimer = null;
	var hoverMode = null;
	var SELECTOR = '.elementor-widget-gallery[data-id]';

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	/* --- Field discovery --- */
	function findProGalleryField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'pro-gallery' === f.kind || 'pro-gallery-multi' === f.kind;
		} )[ 0 ];
	}

	/* --- Add Image button (shown on widget hover) --- */
	function ensureAddBtn() {
		if ( addBtn ) { return; }
		addBtn = document.createElement( 'button' );
		addBtn.type = 'button';
		addBtn.className = 'ri2-gallery-add-btn ri2-ui';
		addBtn.innerHTML = '<span class="dashicons dashicons-plus-alt"></span> Add Image';
		addBtn.title = 'Add Image';
		addBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( addBtnWidget ) {
				var widget = addBtnWidget;
				hideAddBtn();
				doAdd( widget, RI.ctx( widget ) );
			}
		} );
		addBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( addBtn );
	}

	function showAddBtn( widget ) {
		ensureAddBtn();
		clearTimeout( leaveTimer );
		addBtnWidget = widget;

		// Update button label to show which gallery images will be added to.
		var activeTitle = widget.querySelector( '.elementor-gallery-title.elementor-item-active' );
		var galleryName = '';
		if ( activeTitle ) {
			var idx = activeTitle.getAttribute( 'data-gallery-index' );
			if ( idx && 'all' !== idx ) {
				galleryName = activeTitle.textContent.trim();
			}
		}
		if ( galleryName ) {
			addBtn.innerHTML = '<span class="dashicons dashicons-plus-alt"></span> Add to ' + galleryName;
		} else {
			addBtn.innerHTML = '<span class="dashicons dashicons-plus-alt"></span> Add Image';
		}

		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideAddBtn(); return; }
		addBtn.classList.add( 'is-visible' );
		addBtn.style.top = ( r.bottom - 36 ) + 'px';
		addBtn.style.left = ( r.right - addBtn.offsetWidth - 8 ) + 'px';
	}

	function hideAddBtn() {
		if ( addBtn ) { addBtn.classList.remove( 'is-visible' ); }
	}

	/* --- Per-image buttons (Replace / Delete) --- */
	function ensureImgBtns() {
		if ( imgBtns.length ) { return; }
		var replace = document.createElement( 'button' );
		replace.type = 'button';
		replace.className = 'ri2-gallery-btn ri2-gallery-replace ri2-ui';
		replace.innerHTML = '<span class="dashicons dashicons-image-rotate"></span>';
		replace.title = 'Replace';

		var del = document.createElement( 'button' );
		del.type = 'button';
		del.className = 'ri2-gallery-btn ri2-gallery-delete ri2-ui';
		del.innerHTML = '<span class="dashicons dashicons-no"></span>';
		del.title = 'Delete';

		document.body.appendChild( replace );
		document.body.appendChild( del );
		imgBtns = [ replace, del ];
	}

	function showImgBtns( item, attId, widget, ctx, field ) {
		ensureImgBtns();
		clearTimeout( leaveTimer );
		hoverMode = 'img';
		var r = item.getBoundingClientRect();
		if ( r.width < 20 || r.height < 20 ) { hideImgBtns(); return; }

		var replace = imgBtns[ 0 ];
		var del = imgBtns[ 1 ];

		replace.style.top = ( r.top + 4 ) + 'px';
		replace.style.left = ( r.left + 4 ) + 'px';
		replace.classList.add( 'is-visible' );
		replace.onclick = function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			hideImgBtns();
			doReplace( widget, ctx, attId, field );
		};

		del.style.top = ( r.top + 36 ) + 'px';
		del.style.left = ( r.left + 4 ) + 'px';
		del.classList.add( 'is-visible' );
		del.onclick = function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			hideImgBtns();
			doDelete( widget, ctx, attId, field );
		};
	}

	function hideImgBtns() {
		imgBtns.forEach( function ( b ) { b.classList.remove( 'is-visible' ); } );
	}

	function hideAll() {
		hoverMode = null;
		hideAddBtn();
		hideImgBtns();
		addBtnWidget = null;
	}

	/* --- Actions --- */
	function doAdd( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findProGalleryField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}



			var galIdx = getGalleryIndex( field, widget );

			function proceedWithAdd( idx ) {
				ctx.openGalleryMedia( {
					onSelect: function ( attachments ) {
						ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
						var chain = Promise.resolve();
						attachments.forEach( function ( att ) {
							chain = chain.then( function () {
								return ctx.saveProGallery( field.key, 'add', att.id, -1, idx );
							} );
						} );
						chain.then( function () { return ctx.refreshWidget(); } )
							.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
							.catch( function ( err ) {
								ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
							} );
					}
				} );
			}

			if ( galIdx !== null ) {
				proceedWithAdd( galIdx );
			} else {
				openGalPicker( field, widget, proceedWithAdd );
			}
		} ).catch( function () {
			ctx.toast( ctx.i18n.saveFailed || 'Save failed', 'error' );
		} );
	}

	function doReplace( widget, ctx, oldAttId, field ) {
		ctx.openMedia( {
			onSelect: function ( attachment ) {
				ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
				ctx.saveProGallery( field.key, 'replace', attachment.id, oldAttId, getGalleryIndex( field, widget ) )
					.then( function () { return ctx.refreshWidget(); } )
					.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
					.catch( function ( err ) {
						ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
					} );
			}
		} );
	}

	function doDelete( widget, ctx, oldAttId, field ) {
		ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
		ctx.saveProGallery( field.key, 'delete', 0, oldAttId, getGalleryIndex( field, widget ) )
			.then( function () { return ctx.refreshWidget(); } )
			.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
			.catch( function ( err ) {
				ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
			} );
	}

	/* --- Gallery index helper for multiple mode --- */
	// Returns a specific gallery index if one is active, or null if the
	// active filter is "All" / cannot be determined (caller should prompt).
	function getGalleryIndex( field, widget ) {
		if ( 'pro-gallery-multi' !== field.kind ) {
			return -1;
		}

		if ( widget ) {
			var activeTitle = widget.querySelector( '.elementor-gallery-title.elementor-item-active' );
			if ( activeTitle ) {
				var idx = activeTitle.getAttribute( 'data-gallery-index' );
				if ( idx && 'all' !== idx ) {
					return parseInt( idx, 10 );
				}
			}
		}

		// No specific gallery active.
		return null;
	}

	/* --- Gallery picker popup (for "All" or no active filter) --- */
	var galPicker = null;

	function closeGalPicker() {
		if ( galPicker ) {
			galPicker.remove();
			galPicker = null;
		}
	}

	function openGalPicker( field, widget, onPick ) {
		closeGalPicker();

		galPicker = document.createElement( 'div' );
		galPicker.className = 'ri2-galpicker ri2-ui';

		var title = document.createElement( 'div' );
		title.className = 'ri2-galpicker__title';
		title.textContent = 'Select a gallery';
		galPicker.appendChild( title );

		var list = document.createElement( 'div' );
		list.className = 'ri2-galpicker__list';

		( field.galleries || [] ).forEach( function ( gal ) {
			var item = document.createElement( 'button' );
			item.type = 'button';
			item.className = 'ri2-galpicker__item';
			item.textContent = gal.title || ( 'Gallery ' + ( gal.index + 1 ) );
			item.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
			item.addEventListener( 'click', function () {
				closeGalPicker();
				onPick( gal.index );
			} );
			list.appendChild( item );
		} );

		galPicker.appendChild( list );

		var cancel = document.createElement( 'button' );
		cancel.type = 'button';
		cancel.className = 'ri2-galpicker__cancel';
		cancel.textContent = 'Cancel';
		cancel.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		cancel.addEventListener( 'click', function () { closeGalPicker(); } );
		galPicker.appendChild( cancel );

		document.body.appendChild( galPicker );

		// Center the picker over the widget.
		var r = widget.getBoundingClientRect();
		galPicker.style.top = ( r.top + r.height / 2 - galPicker.offsetHeight / 2 ) + 'px';
		galPicker.style.left = ( r.left + r.width / 2 - galPicker.offsetWidth / 2 ) + 'px';
	}

	/* --- Image matching: find which gallery item was hovered --- */
	function getGalleryItems( widget ) {
		return widget.querySelectorAll( '.e-gallery-item' );
	}

	function indexOfItem( widget, item ) {
		var all = getGalleryItems( widget );
		for ( var i = 0; i < all.length; i++ ) {
			if ( all[ i ] === item ) { return i; }
		}
		return -1;
	}

	/* --- Attachment ID lookup via flat_images (DOM order) --- */
	function getAttachmentIdByIndex( field, domIndex ) {
		var flat = field.flat_images;
		if ( flat && flat[ domIndex ] ) {
			return flat[ domIndex ];
		}
		return 0;
	}

	/* --- Overlay metadata mapping --- */
	// The overlay_title/overlay_description settings select which attachment
	// metadata field to display. Map the setting value to the attachment meta field.
	var META_MAP = {
		title:       'title',
		caption:     'caption',
		alt:         'alt',
		description: 'description'
	};

	/* --- Click handler for overlay title/description and gallery titles --- */
	function handleClick( e, widget, ctx ) {
		// 1. Gallery filter title (multiple mode) — inline edit gallery_title
		var galleryTitle = e.target.closest && e.target.closest( '.elementor-gallery-title' );
		if ( galleryTitle && widget.contains( galleryTitle ) ) {
			var idx = galleryTitle.getAttribute( 'data-gallery-index' );
			if ( idx === 'all' ) { return; }
			e.preventDefault();
			e.stopPropagation();
			ctx.getFields().then( function ( res ) {
				var field = findProGalleryField( res );
				if ( ! field || 'pro-gallery-multi' !== field.kind ) { return; }
				ctx.editText( galleryTitle, {
					key:        field.key,
					slideIndex: parseInt( idx, 10 ),
					subField:   'gallery_title',
					kind:       'text'
				} );
			} );
			return;
		}

		// 2. Overlay title — edit attachment metadata
		var overlayTitle = e.target.closest && e.target.closest( '.elementor-gallery-item__title' );
		if ( overlayTitle && widget.contains( overlayTitle ) ) {
			e.preventDefault();
			e.stopPropagation();
			handleOverlayEdit( e, widget, ctx, overlayTitle, 'title' );
			return;
		}

		// 3. Overlay description — edit attachment metadata
		var overlayDesc = e.target.closest && e.target.closest( '.elementor-gallery-item__description' );
		if ( overlayDesc && widget.contains( overlayDesc ) ) {
			e.preventDefault();
			e.stopPropagation();
			handleOverlayEdit( e, widget, ctx, overlayDesc, 'description' );
			return;
		}
	}

	function handleOverlayEdit( e, widget, ctx, node, type ) {
		// Find the gallery item element (parent .e-gallery-item)
		var itemEl = node.closest( '.e-gallery-item' );
		if ( ! itemEl ) { return; }

		var index = indexOfItem( widget, itemEl );
		if ( index < 0 ) { return; }

		ctx.getFields().then( function ( res ) {
			var field = findProGalleryField( res );
			if ( ! field ) { return; }

			// Determine which attachment meta field to edit
			var settingKey = 'title' === type ? 'overlay_title' : 'overlay_description';
			var metaField = field[ settingKey ];
			if ( ! metaField || ! META_MAP[ metaField ] ) { return; }
			var actualField = META_MAP[ metaField ];

			// Get attachment ID from flat_images (DOM order)
			var attId = getAttachmentIdByIndex( field, index );

			if ( ! attId ) {
				ctx.toast( 'Could not identify the image.', 'error' );
				return;
			}

			// Start inline text edit
			RI._editAttachmentText( widget, node, {
				attachmentId: attId,
				field:        actualField,
				kind:        'text'
			} );
		} );
	}

	/* --- Hover detection --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }

		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }

		// Check if hovering a gallery item
		var item = e.target.closest && e.target.closest( '.e-gallery-item' );
		if ( item && widget.contains( item ) ) {
			var idx = indexOfItem( widget, item );
			if ( idx >= 0 ) {
				var ctx = RI.ctx( widget );
				hoverMode = 'img';
				ctx.getFields().then( function ( res ) {
					if ( ! RI.isActive() || ! item.matches( ':hover' ) ) { return; }
					var field = findProGalleryField( res );
					if ( field ) {
						var attId = getAttachmentIdByIndex( field, idx );
						if ( attId ) {
							showImgBtns( item, attId, widget, ctx, field );
						}
					}
				} ).catch( function () {} );
				return;
			}
		}

		// Widget-level hover: show Add button
		if ( hoverMode === 'img' ) {
			hoverMode = null;
			hideImgBtns();
		}
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() || ! widget.matches( ':hover' ) ) { return; }
			if ( hoverMode === 'img' ) { return; }
			if ( findProGalleryField( res ) ) {
				showAddBtn( widget );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! addBtnWidget && ! imgBtns.some( function ( b ) { return b.classList.contains( 'is-visible' ); } ) ) { return; }

		var to = e.relatedTarget;
		if ( to && ( to === addBtn || ( addBtn && addBtn.contains( to ) ) ) ) { return; }
		if ( to && imgBtns.some( function ( b ) { return to === b || b.contains( to ); } ) ) { return; }
		if ( addBtnWidget && to && addBtnWidget.contains( to ) ) { return; }

		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( addBtn && addBtn.matches( ':hover' ) ) { return; }
			if ( imgBtns.some( function ( b ) { return b.matches( ':hover' ); } ) ) { return; }
			hideAll();
		}, 100 );
	} );

	window.addEventListener( 'scroll', function () { hideAll(); closeGalPicker(); }, true );
	window.addEventListener( 'resize', function () { hideAll(); closeGalPicker(); } );

	document.addEventListener( 'click', function ( e ) {
		if ( ! galPicker ) { return; }
		if ( galPicker.contains( e.target ) ) { return; }
		closeGalPicker();
	}, true );

	var handler = {
		onClick: handleClick,
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'gallery', handler );

} )( window.RomanInline2 );
