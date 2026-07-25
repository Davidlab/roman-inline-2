/**
 * Roman Inline 2 — Pro flip-box widget handler.
 *
 * - Hover flip is disabled while RI2 is active (CSS override).
 * - Hover the widget → floating "Flip" button (top-left) to toggle front/back.
 * - Hover the widget → floating "Graphic" button (top-left, below flip) to change icon/image.
 * - Click front title → inline edit (text).
 * - Click front description → inline edit (text).
 * - Click front icon → open icon picker.
 * - Click front image → open image media frame.
 * - Click back title → inline edit (text).
 * - Click back description → inline edit (text).
 * - Click button text → inline edit (text).
 * - Hover the widget → floating link button (top-right) to edit the link.
 *
 * Controls: title_text_a, description_text_a, title_text_b, description_text_b,
 *           button_text, link, image, selected_icon, graphic_element.
 * Markup: .elementor-flip-box__layer__title, .elementor-flip-box__layer__description,
 *         .elementor-flip-box__button, .elementor-flip-box__image, .elementor-icon-wrapper.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-flip-box[data-id]';

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
		hoveredImg = null;
	}

	/* --- Floating link button --- */
	let linkBtn = null;
	let linkLeaveTimer = null;

	/* --- Floating flip button --- */
	let flipBtn = null;
	let flipLeaveTimer = null;
	let flippedWidget = null;

	function ensureFlipBtn() {
		if ( flipBtn ) { return; }
		flipBtn = document.createElement( 'button' );
		flipBtn.type = 'button';
		flipBtn.className = 'ri2-flipbtn ri2-ui';
		flipBtn.innerHTML = '<span class="dashicons dashicons-randomize"></span> ' + ( RI.i18n.flipBack || 'Back' );
		flipBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( flipLeaveTimer );
			if ( flippedWidget ) {
				flippedWidget.classList.toggle( 'elementor-flip-box--flipped' );
				updateFlipBtnLabel( flippedWidget );
			}
		} );
		flipBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( flipBtn );
	}

	function updateFlipBtnLabel( widget ) {
		if ( ! flipBtn ) { return; }
		var isFlipped = widget.classList.contains( 'elementor-flip-box--flipped' );
		flipBtn.innerHTML = '<span class="dashicons dashicons-randomize"></span> ' + ( isFlipped ? ( RI.i18n.flipFront || 'Front' ) : ( RI.i18n.flipBack || 'Back' ) );
	}

	function showFlipBtn( widget ) {
		ensureFlipBtn();
		clearTimeout( flipLeaveTimer );
		flippedWidget = widget;
		updateFlipBtnLabel( widget );
		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideFlipBtn(); return; }
		flipBtn.classList.add( 'is-visible' );
		flipBtn.style.top = ( r.top + 6 ) + 'px';
		flipBtn.style.left = ( r.left + 6 ) + 'px';
	}

	function hideFlipBtn() {
		if ( flipBtn ) { flipBtn.classList.remove( 'is-visible' ); }
	}

	/* --- Floating graphic button + popup --- */
	let graphicBtn = null;
	let graphicLeaveTimer = null;
	let graphicWidget = null;
	let graphicPop = null;

	function ensureGraphicBtn() {
		if ( graphicBtn ) { return; }
		graphicBtn = document.createElement( 'button' );
		graphicBtn.type = 'button';
		graphicBtn.className = 'ri2-graphicbtn ri2-ui';
		graphicBtn.innerHTML = '<span class="dashicons dashicons-star-filled"></span> ' + ( RI.i18n.graphic || 'Graphic' );
		graphicBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( graphicLeaveTimer );
			if ( graphicWidget ) {
				openGraphicPop( graphicWidget );
			}
		} );
		graphicBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( graphicBtn );
	}

	function showGraphicBtn( widget ) {
		ensureGraphicBtn();
		clearTimeout( graphicLeaveTimer );
		graphicWidget = widget;
		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideGraphicBtn(); return; }
		graphicBtn.classList.add( 'is-visible' );
		graphicBtn.style.top = ( r.top + 36 ) + 'px';
		graphicBtn.style.left = ( r.left + 6 ) + 'px';
	}

	function hideGraphicBtn() {
		if ( graphicBtn ) { graphicBtn.classList.remove( 'is-visible' ); }
		closeGraphicPop();
	}

	function closeGraphicPop() {
		document.removeEventListener( 'click', graphicPopOutside, true );
		if ( graphicPop && graphicPop.parentNode ) { graphicPop.parentNode.removeChild( graphicPop ); }
		graphicPop = null;
	}

	function openGraphicPop( widget ) {
		closeGraphicPop();
		var ctx = RI.ctx( widget );
		var wid = ctx.widgetId;

		graphicPop = document.createElement( 'div' );
		graphicPop.className = 'ri2-graphicpop ri2-ui';

		var items = [
			{ icon: 'dashicons-star-filled', label: RI.i18n.changeIcon || 'Change Icon', val: 'icon' },
			{ icon: 'dashicons-format-image', label: RI.i18n.changeImage || 'Change Image', val: 'image' },
			{ icon: 'dashicons-ban', label: RI.i18n.removeGraphic || 'Remove', val: 'none' }
		];

		items.forEach( function ( item ) {
			var btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'ri2-graphicpop__item';
			btn.innerHTML = '<span class="dashicons ' + item.icon + '"></span> ' + item.label;
			btn.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				e.stopPropagation();
				closeGraphicPop();
				handleGraphicChoice( widget, ctx, item.val );
			} );
			graphicPop.appendChild( btn );
		} );

		document.body.appendChild( graphicPop );
		var br = graphicBtn.getBoundingClientRect();
		graphicPop.style.top = ( br.bottom + 4 ) + 'px';
		graphicPop.style.left = br.left + 'px';

		// Close on outside click.
		setTimeout( function () {
			document.addEventListener( 'click', graphicPopOutside, true );
		}, 0 );
	}

	function graphicPopOutside( e ) {
		if ( graphicPop && ! graphicPop.contains( e.target ) && graphicBtn && ! graphicBtn.contains( e.target ) ) {
			closeGraphicPop();
			document.removeEventListener( 'click', graphicPopOutside, true );
		}
	}

	function handleGraphicChoice( widget, ctx, choice ) {

		if ( 'icon' === choice ) {
			ctx.toast( RI.i18n.saving || 'Saving…', 'saving' );
			ctx.saveSetting( 'graphic_element', 'icon' ).then( function () {
				return ctx.refreshWidget();
			} ).then( function ( newWidget ) {
				if ( newWidget ) { RI.ctx( newWidget ).replaceIcon(); }
			} ).catch( function ( err ) {
				ctx.toast( ( err && err.message ) || RI.i18n.saveFailed || 'Save failed', 'error' );
			} );
		} else if ( 'image' === choice ) {
			ctx.toast( RI.i18n.saving || 'Saving…', 'saving' );
			ctx.saveSetting( 'graphic_element', 'image' ).then( function () {
				return ctx.refreshWidget();
			} ).then( function ( newWidget ) {
				if ( ! newWidget ) { return; }
				var nctx = RI.ctx( newWidget );
				var img = newWidget.querySelector( '.elementor-flip-box__image img' );
				if ( img ) {
					nctx.replaceImage( img, { key: 'image', isAtomic: false } );
				} else {
					var front = newWidget.querySelector( '.elementor-flip-box__front' );
					if ( front ) {
						nctx.replaceImage( front, { key: 'image', isAtomic: false } );
					}
				}
			} ).catch( function ( err ) {
				ctx.toast( ( err && err.message ) || RI.i18n.saveFailed || 'Save failed', 'error' );
			} );
		} else if ( 'none' === choice ) {
			ctx.toast( RI.i18n.saving || 'Saving…', 'saving' );
			ctx.saveSetting( 'graphic_element', 'none' ).then( function () {
				return ctx.refreshWidget();
			} ).then( function () {
				ctx.toast( RI.i18n.saved || 'Saved', 'ok' );
			} ).catch( function ( err ) {
				ctx.toast( ( err && err.message ) || RI.i18n.saveFailed || 'Save failed', 'error' );
			} );
		}
	}

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
		if ( e.relatedTarget && imgBtn && ( e.relatedTarget === imgBtn || imgBtn.contains( e.relatedTarget ) ) ) { return; }
		clearTimeout( imgLeaveTimer );
		imgLeaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
			hideImgBtn();
		}, 60 );
	} );

	/* --- Widget hover for link and flip buttons --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findField( res, 'link' ) ) {
				showLinkBtn( widget );
			}
			showFlipBtn( widget );
			showGraphicBtn( widget );
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
		clearTimeout( flipLeaveTimer );
		flipLeaveTimer = setTimeout( function () {
			if ( flipBtn && flipBtn.matches( ':hover' ) ) { return; }
			hideFlipBtn();
		}, 100 );
		clearTimeout( graphicLeaveTimer );
		graphicLeaveTimer = setTimeout( function () {
			if ( graphicBtn && graphicBtn.matches( ':hover' ) ) { return; }
			if ( graphicPop && graphicPop.matches( ':hover' ) ) { return; }
			hideGraphicBtn();
		}, 100 );
	}, true );

	window.addEventListener( 'scroll', function () { hideImgBtn(); hideLinkBtn(); hideFlipBtn(); hideGraphicBtn(); }, true );
	window.addEventListener( 'resize', function () { hideImgBtn(); hideLinkBtn(); hideFlipBtn(); hideGraphicBtn(); } );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				const front = widget.querySelector( '.elementor-flip-box__front' );
				const back = widget.querySelector( '.elementor-flip-box__back' );

				// Front title
				if ( front ) {
					const titleA = front.querySelector( '.elementor-flip-box__layer__title' );
					if ( titleA && ( event.target === titleA || titleA.contains( event.target ) ) ) {
						const field = findFieldByKey( res, 'title_text_a' );
						if ( field ) {
							ctx.editText( titleA, { key: field.key, kind: 'text', isAtomic: false } );
							return;
						}
					}

					// Front description
					const descA = front.querySelector( '.elementor-flip-box__layer__description' );
					if ( descA && ( event.target === descA || descA.contains( event.target ) ) ) {
						const field = findFieldByKey( res, 'description_text_a' );
						if ( field ) {
							ctx.editText( descA, { key: field.key, kind: 'text', isAtomic: false } );
							return;
						}
					}
				}

				// Back title
				if ( back ) {
					const titleB = back.querySelector( '.elementor-flip-box__layer__title' );
					if ( titleB && ( event.target === titleB || titleB.contains( event.target ) ) ) {
						const field = findFieldByKey( res, 'title_text_b' );
						if ( field ) {
							ctx.editText( titleB, { key: field.key, kind: 'text', isAtomic: false } );
							return;
						}
					}

					// Back description
					const descB = back.querySelector( '.elementor-flip-box__layer__description' );
					if ( descB && ( event.target === descB || descB.contains( event.target ) ) ) {
						const field = findFieldByKey( res, 'description_text_b' );
						if ( field ) {
							ctx.editText( descB, { key: field.key, kind: 'text', isAtomic: false } );
							return;
						}
					}

					// Button text
					const btn = back.querySelector( '.elementor-flip-box__button' );
					if ( btn && ( event.target === btn || btn.contains( event.target ) ) ) {
						const field = findFieldByKey( res, 'button_text' );
						if ( field ) {
							ctx.editText( btn, { key: field.key, kind: 'text', isAtomic: false, fieldMap: res } );
							return;
						}
					}
				}

				// Image click → replace image
				const img = widget.querySelector( '.elementor-flip-box__image img' );
				if ( img && ( event.target === img || img.contains( event.target ) ) ) {
					hideImgBtn();
					doReplaceImage( img, ctx );
					return;
				}

				// Icon click → open icon picker
				const iconWrapper = front ? front.querySelector( '.elementor-icon-wrapper' ) : null;
				if ( iconWrapper && ( event.target === iconWrapper || iconWrapper.contains( event.target ) ) ) {
					ctx.replaceIcon();
					return;
				}

				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'flip-box', handler );

} )( window.RomanInline2 );
