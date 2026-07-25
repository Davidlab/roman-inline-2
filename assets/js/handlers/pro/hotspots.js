/**
 * Roman Inline 2 — Pro hotspot widget handler.
 *
 * Repeater control 'hotspots' with sub-fields:
 *   - hotspot_label           (TEXT)      → inline edit on click
 *   - hotspot_tooltip_content (TEXTAREA)  → inline edit on click
 *   - hotspot_link            (URL)       → link popover on click
 *
 * The main image is also editable (Change Image button on hover).
 *
 * Markup: .e-hotspot (with .elementor-repeater-item-{{_id}}),
 *         .e-hotspot__label, .e-hotspot__tooltip, main <img>.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-hotspot[data-id]';

	let imgBtn = null;
	let hoveredImg = null;
	let imgLeaveTimer = null;

	function widgetOf( el ) {
		return el.closest && el.closest( SELECTOR );
	}

	function findRepeaterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'repeater' === f.kind; } )[ 0 ];
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	function getHotspots( widget ) {
		return widget.querySelectorAll( '.e-hotspot' );
	}

	function findHotspotIndex( widget, target ) {
		const hotspots = getHotspots( widget );
		for ( let i = 0; i < hotspots.length; i++ ) {
			if ( hotspots[ i ] === target || hotspots[ i ].contains( target ) ) {
				return { el: hotspots[ i ], index: i };
			}
		}
		return null;
	}

	/* --- "Change Image" button --- */
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
			if ( ! hoveredImg ) { return; }
			const img = hoveredImg;
			hideImgBtn();
			const widget = widgetOf( img );
			if ( ! widget ) { return; }
			const ctx = RI.ctx( widget );
			ctx.getFields().then( function ( res ) {
				const field = findField( res, 'image' );
				if ( ! field ) { return; }
				ctx.replaceImage( img, { key: field.key, isAtomic: false } );
			} );
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
		hoveredImg = null;
	}

	/* --- Main image hover --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( 'IMG' !== e.target.tagName ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		// Only show for the main image, not hotspot icons
		if ( e.target.closest( '.e-hotspot' ) ) { return; }
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
		if ( e.relatedTarget && imgBtn && ( e.relatedTarget === imgBtn || imgBtn.contains( e.relatedTarget ) ) ) { return; }
		clearTimeout( imgLeaveTimer );
		imgLeaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
			hideImgBtn();
		}, 60 );
	} );

	window.addEventListener( 'scroll', function () { hideImgBtn(); }, true );
	window.addEventListener( 'resize', function () { hideImgBtn(); } );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				// Main image click → replace image
				const mainImg = widget.querySelector( 'img' );
				if ( mainImg && event.target === mainImg && ! event.target.closest( '.e-hotspot' ) ) {
					hideImgBtn();
					const imgField = findField( res, 'image' );
					if ( imgField ) {
						ctx.replaceImage( mainImg, { key: imgField.key, isAtomic: false } );
						return;
					}
				}

				// Hotspot repeater fields
				const hotspot = findHotspotIndex( widget, event.target );
				if ( hotspot ) {
					const repField = findRepeaterField( res );
					if ( repField ) {
						// Label
						const labelEl = hotspot.el.querySelector( '.e-hotspot__label' );
						if ( labelEl && ( event.target === labelEl || labelEl.contains( event.target ) ) ) {
							ctx.editText( labelEl, {
								key: repField.key, kind: 'text', itemIndex: hotspot.index, subField: 'hotspot_label'
							} );
							return;
						}

						// Tooltip content
						const tooltipEl = hotspot.el.querySelector( '.e-hotspot__tooltip' );
						if ( tooltipEl && ( event.target === tooltipEl || tooltipEl.contains( event.target ) ) ) {
							ctx.editText( tooltipEl, {
								key: repField.key, kind: 'text', itemIndex: hotspot.index, subField: 'hotspot_tooltip_content'
							} );
							return;
						}

						// Link (the hotspot element itself can be an <a>)
						if ( hotspot.el.tagName === 'A' ) {
							if ( labelEl && ( event.target === labelEl || labelEl.contains( event.target ) ) ) { return; }
							if ( tooltipEl && ( event.target === tooltipEl || tooltipEl.contains( event.target ) ) ) { return; }
							ctx.editLink( hotspot.el, {
								key: repField.key, itemIndex: hotspot.index, subField: 'hotspot_link'
							} );
							return;
						}
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

	RI.register( 'hotspot', handler );

} )( window.RomanInline2 );
