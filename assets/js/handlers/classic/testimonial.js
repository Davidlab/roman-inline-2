/**
 * Roman Inline 2 — Classic testimonial widget handler.
 *
 * - Click the content → inline edit (text, no toolbar).
 * - Click the name → inline edit (text, no toolbar).
 * - Click the job/title → inline edit (text, no toolbar).
 * - Hover the image → floating "Change Image" button.
 * - Hover the widget → floating link button (top-right) to edit the link.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var SELECTOR = '.elementor-widget-testimonial[data-id]';

	/* --- Floating "Change Image" button --- */
	var imgBtn = null;
	var hoveredImg = null;
	var imgLeaveTimer = null;

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
				var img = hoveredImg;
				hideImgBtn();
				var widget = widgetOf( img );
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
		var r = img.getBoundingClientRect();
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
	var linkBtn = null;
	var linkLeaveTimer = null;

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
			var w = linkBtn._widget;
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
		var r = widget.getBoundingClientRect();
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
		return el.closest && el.closest( SELECTOR );
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	function findFieldByKey( res, key ) {
		return ( res.fields || [] ).filter( function ( f ) { return f.key === key; } )[ 0 ];
	}

	function doReplaceImage( img, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findField( res, 'image' );
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
		var widget = widgetOf( e.target );
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
		var widget = widgetOf( e.target );
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
		var widget = widgetOf( e.target );
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
	var handler = {
		onClick: function ( event, widget, ctx ) {
			// Prevent link navigation while editing.
			var anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				var fields = res.fields || [];

				// Image click → replace image.
				var img = widget.querySelector( '.elementor-testimonial-image img' );
				if ( img && ( event.target === img || img.contains( event.target ) ) ) {
					hideImgBtn();
					doReplaceImage( img, ctx );
					return;
				}

				// Content click → inline edit (text kind).
				var contentEl = widget.querySelector( '.elementor-testimonial-content' );
				if ( contentEl && ( event.target === contentEl || contentEl.contains( event.target ) ) ) {
					var contentField = findFieldByKey( res, 'testimonial_content' );
					if ( contentField ) {
						ctx.editText( contentEl, {
							key:      contentField.key,
							kind:     'text',
							isAtomic: false
						} );
						return;
					}
				}

				// Name click → inline edit (text kind).
				var nameEl = widget.querySelector( '.elementor-testimonial-name' );
				if ( nameEl && ( event.target === nameEl || nameEl.contains( event.target ) ) ) {
					var nameField = findFieldByKey( res, 'testimonial_name' );
					if ( nameField ) {
						ctx.editText( nameEl, {
							key:      nameField.key,
							kind:     'text',
							isAtomic: false
						} );
						return;
					}
				}

				// Job click → inline edit (text kind).
				var jobEl = widget.querySelector( '.elementor-testimonial-job' );
				if ( jobEl && ( event.target === jobEl || jobEl.contains( event.target ) ) ) {
					var jobField = findFieldByKey( res, 'testimonial_job' );
					if ( jobField ) {
						ctx.editText( jobEl, {
							key:      jobField.key,
							kind:     'text',
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

	RI.register( 'testimonial', handler );

} )( window.RomanInline2 );
