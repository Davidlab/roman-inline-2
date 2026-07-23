/**
 * Roman Inline 2 — Classic image-box widget handler.
 *
 * - Hover the image → floating "Change Image" button (swap via WP media).
 * - Click the title → inline edit (text, no toolbar).
 * - Click the description → inline edit (rich-text toolbar).
 * - Hover the widget → small link icon button (top-right) to edit the box link.
 *
 * Field detection uses markers (data-elementor-setting-key) for title/description,
 * classic_image_fields() for the image, and classic_link() for the link.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	/* --- Floating "Change Image" button --- */
	let imgBtn = null;
	let hoveredImg = null;
	let imgLeaveTimer = null;

	function ensureImgBtn() {
		if ( imgBtn ) { return; }
		imgBtn = document.createElement( 'button' );
		imgBtn.type = 'button';
		imgBtn.className = 'ri2-imgbtn ri2-ui';
		imgBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span> ' + ( RI.i18n.changeImage || 'Change Image' );
		imgBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( imgLeaveTimer );
			if ( hoveredImg ) {
				const img = hoveredImg;
				hideImgBtn();
				const widget = widgetOf( img );
				if ( widget ) {
					doReplaceImage( img, RI.ctx( widget ) );
				}
			}
		} );
		imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( imgBtn );
	}

	function showImgBtn( img ) {
		ensureImgBtn();
		clearTimeout( imgLeaveTimer );
		hoveredImg = img;
		const r = img.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideImgBtn(); return; }
		imgBtn.style.top = ( r.top + 8 ) + 'px';
		imgBtn.style.left = ( r.left + 8 ) + 'px';
		imgBtn.classList.add( 'is-visible' );
	}

	function hideImgBtn() {
		if ( imgBtn ) { imgBtn.classList.remove( 'is-visible' ); }
	}

	function reallyHideImgBtn() {
		hideImgBtn();
		hoveredImg = null;
	}

	/* --- Floating link icon button --- */
	let linkBtn = null;
	let linkLeaveTimer = null;

	function ensureLinkBtn() {
		if ( linkBtn ) { return; }
		linkBtn = document.createElement( 'button' );
		linkBtn.type = 'button';
		linkBtn.className = 'ri2-linkbtn ri2-ui';
		linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links"></span>';
		linkBtn.title = RI.i18n.editLink || 'Edit Link';
		linkBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( linkLeaveTimer );
			hideLinkBtn();
			const w = linkBtn._widget;
			if ( w ) {
				RI.ctx( w ).editLink( w, { key: 'link' } );
			}
		} );
		linkBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( linkBtn );
	}

	function showLinkBtn( widget ) {
		ensureLinkBtn();
		clearTimeout( linkLeaveTimer );
		linkBtn._widget = widget;
		const r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideLinkBtn(); return; }
		linkBtn.classList.add( 'is-visible' );
		linkBtn.style.top = ( r.top + 6 ) + 'px';
		linkBtn.style.left = ( r.right - linkBtn.offsetWidth - 6 ) + 'px';
	}

	function hideLinkBtn() {
		if ( linkBtn ) { linkBtn.classList.remove( 'is-visible' ); }
	}

	/* --- Helpers --- */
	function widgetOf( el ) {
		return el.closest && el.closest( '.elementor-widget-image-box[data-id]' );
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	function doReplaceImage( img, ctx ) {
		ctx.getFields().then( function ( res ) {
			const field = findField( res, 'image' );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceImage( img, {
				key:      field.key,
				isAtomic: false
			} );
		} );
	}

	/* --- Image hover (direct mouseover/mouseout on IMG elements) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( 'IMG' !== e.target.tagName ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findField( res, 'image' ) ) {
				showImgBtn( e.target );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredImg ) { return; }
		if ( e.relatedTarget && e.relatedTarget === imgBtn ) { return; }
		if ( imgBtn && imgBtn.contains( e.relatedTarget ) ) { return; }
		clearTimeout( imgLeaveTimer );
		imgLeaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
			reallyHideImgBtn();
		}, 60 );
	} );

	/* --- Widget hover for link button --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findField( res, 'link' ) ) {
				showLinkBtn( widget );
			}
		} ).catch( function () {} );
	}, true );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		clearTimeout( linkLeaveTimer );
		linkLeaveTimer = setTimeout( function () {
			if ( linkBtn && linkBtn.matches( ':hover' ) ) { return; }
			hideLinkBtn();
		}, 100 );
	}, true );

	window.addEventListener( 'scroll', function () {
		reallyHideImgBtn();
		hideLinkBtn();
	}, true );
	window.addEventListener( 'resize', function () {
		reallyHideImgBtn();
		hideLinkBtn();
	} );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			// Prevent link navigation while editing.
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				const fields = res.fields || [];

				// Image click → replace image.
				const img = widget.querySelector( '.elementor-image-box-img img' );
				if ( img && ( event.target === img || img.contains( event.target ) ) ) {
					hideImgBtn();
					doReplaceImage( img, ctx );
					return;
				}

				// Title click → inline edit (text kind, no toolbar).
				const titleEl = widget.querySelector( '.elementor-image-box-title' );
				if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) {
					const titleField = fields.filter( function ( f ) { return 'title_text' === f.key; } )[ 0 ];
					if ( titleField ) {
						ctx.editText( titleEl, {
							key:      titleField.key,
							kind:     'text',
							isAtomic: false
						} );
						return;
					}
				}

				// Description click → inline edit (rich_text toolbar).
				const descEl = widget.querySelector( '.elementor-image-box-description' );
				if ( descEl && ( event.target === descEl || descEl.contains( event.target ) ) ) {
					const descField = fields.filter( function ( f ) { return 'description_text' === f.key; } )[ 0 ];
					if ( descField ) {
						ctx.editText( descEl, {
							key:      descField.key,
							kind:     'rich_text',
							isAtomic: false
						} );
						return;
					}
				}

				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'image-box', handler );

} )( window.RomanInline2 );
