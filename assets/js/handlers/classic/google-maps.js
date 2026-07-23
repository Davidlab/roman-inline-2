/**
 * Roman Inline 2 — Classic Google Maps widget handler.
 *
 * Elementor's Google Maps widget (google_maps) stores the location as
 * a plain text string in settings.address. The widget renders an iframe,
 * so inline text editing isn't possible — instead we show a floating
 * "Edit Address" button on hover that opens a text popover.
 *
 * Hover shows floating button via direct mouseover/mouseout (like image.js).
 * Click button or widget opens a text popover with the current address.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	let btn = null;
	let btnWidget = null;
	let leaveTimer = null;
	let pop = null;

	function findAddressField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'text' === f.kind && 'address' === f.key;
		} )[ 0 ];
	}

	function closePop() {
		if ( pop && pop.parentNode ) { pop.parentNode.removeChild( pop ); }
		pop = null;
	}

	function openPop( widget, ctx, field ) {
		closePop();
		pop = document.createElement( 'div' );
		pop.className = 'ri2-vidpop ri2-ui';
		const inner = document.createElement( 'div' );
		inner.className = 'ri2-vidpop__inner';

		const title = document.createElement( 'div' );
		title.className = 'ri2-vidpop__title';
		title.textContent = field.label || 'Address';
		inner.appendChild( title );

		const row = document.createElement( 'div' );
		row.className = 'ri2-vidpop__row';
		const input = document.createElement( 'input' );
		input.className = 'ri2-vidpop__input';
		input.type = 'text';
		input.value = field.value || '';
		input.placeholder = 'Enter address…';
		row.appendChild( input );
		inner.appendChild( row );

		const actions = document.createElement( 'div' );
		actions.className = 'ri2-vidpop__actions';

		const cancel = document.createElement( 'button' );
		cancel.type = 'button';
		cancel.className = 'ri2-vidpop__cancel';
		cancel.textContent = ctx.i18n.cancel || 'Cancel';
		cancel.addEventListener( 'click', closePop );

		const save = document.createElement( 'button' );
		save.type = 'button';
		save.className = 'ri2-vidpop__save';
		save.textContent = ctx.i18n.done || 'Save';
		save.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		save.addEventListener( 'click', function () {
			const val = input.value.trim();
			closePop();
			ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
			ctx.saveText( field.key, val, field.kind )
				.then( function () {
					return ctx.refreshWidget();
				} )
				.then( function () {
					ctx.toast( ctx.i18n.saved || 'Saved', 'ok' );
				} )
				.catch( function ( err ) {
					ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
				} );
		} );

		actions.appendChild( cancel );
		actions.appendChild( save );
		inner.appendChild( actions );
		pop.appendChild( inner );
		document.body.appendChild( pop );
		input.focus();
		input.select();

		// Close on outside click.
		setTimeout( function () {
			document.addEventListener( 'mousedown', outsideClose, true );
		}, 0 );
	}

	function outsideClose( e ) {
		if ( pop && ! pop.contains( e.target ) ) {
			closePop();
			document.removeEventListener( 'mousedown', outsideClose, true );
		}
	}

	function doEdit( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			const field = findAddressField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			openPop( widget, ctx, field );
		} );
	}

	function ensureBtn() {
		if ( btn ) { return; }
		btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'ri2-floatbtn ri2-ui';
		btn.innerHTML = '<span class="dashicons dashicons-location-alt"></span> Edit Address';
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( btnWidget ) {
				const widget = btnWidget;
				hideBtn();
				doEdit( widget, RI.ctx( widget ) );
			}
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( btn );
	}

	function showBtn( widget ) {
		ensureBtn();
		clearTimeout( leaveTimer );
		btnWidget = widget;
		const r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideBtn(); return; }
		btn.style.top = ( r.top + 8 ) + 'px';
		btn.style.left = ( r.left + 8 ) + 'px';
		btn.classList.add( 'is-visible' );
	}

	function hideBtn() {
		if ( btn ) { btn.classList.remove( 'is-visible' ); }
	}

	function reallyHideBtn() {
		hideBtn();
		btnWidget = null;
	}

	function isOurBtn( el ) {
		return el === btn || ( btn && btn.contains( el ) );
	}

	/* --- Hover detection (direct mouseover/mouseout) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }

		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() || ! widget.matches( ':hover' ) ) { return; }
			if ( findAddressField( res ) ) {
				showBtn( widget );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! btnWidget ) { return; }
		if ( e.relatedTarget && isOurBtn( e.relatedTarget ) ) { return; }
		if ( btnWidget && e.relatedTarget && btnWidget.contains( e.relatedTarget ) ) { return; }
		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( btnWidget && btnWidget.matches( ':hover' ) ) { return; }
			if ( btn && btn.matches( ':hover' ) ) { return; }
			reallyHideBtn();
		}, 100 );
	} );

	window.addEventListener( 'scroll', function () { reallyHideBtn(); }, true );
	window.addEventListener( 'resize', function () { reallyHideBtn(); } );

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( '.elementor-widget-google_maps[data-id]' );
	}

	const handler = {
		onClick: function ( event, widget, ctx ) {
			reallyHideBtn();
			doEdit( widget, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'google_maps', handler );

} )( window.RomanInline2 );
