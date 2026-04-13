/* ============================================================
   YUGE Sauna & Spa — LP Scripts
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     ⚠️ GASのデプロイURL（要変更）
     gas-code.gs をGoogle Apps Scriptにデプロイ後、
     発行されたURLをここに貼り付けてください
     ============================================================ */
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbz6q6C34ev7zgQyFmOsi_Fp0AsWRsFoBAmDXPncPBaCw5pQ2EwF4u5T9KYF0lqC4_J3Dg/exec';


  document.addEventListener('DOMContentLoaded', init);

  /* 予約空き情報のキャッシュ */
  var availabilityCache = null;

  /* スクロール位置の記録 */
  var savedScrollY = 0;

  /* iOS Safari対応のスクロールロック */
  function lockBodyScroll() {
    savedScrollY = window.scrollY;
    document.body.classList.add('is-modal-open');
    document.body.style.top = '-' + savedScrollY + 'px';
  }

  function unlockBodyScroll() {
    document.body.classList.remove('is-modal-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  function init() {
    setupScrollReveal();
    setupSmoothScroll();
    setupFloatingButton();
    setupModal();
    setupDocModals();
    setupForm();
    setupDateMin();
    setupAvailabilityCheck();
    setupPlanGenderSwitch();
    setupHeroSlideshow();
  }


  /* ----------------------------------------------------------
     ヒーロー画像スライドショー（クロスフェード）
     ---------------------------------------------------------- */
  function setupHeroSlideshow() {
    var slides = document.querySelectorAll('.hero-slide');
    if (slides.length < 2) return;

    // prefers-reduced-motion を尊重
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var currentIndex = 0;
    var INTERVAL = 6000; // 6秒ごとに切り替え

    setInterval(function () {
      slides[currentIndex].classList.remove('is-active');
      currentIndex = (currentIndex + 1) % slides.length;
      slides[currentIndex].classList.add('is-active');
    }, INTERVAL);
  }


  /* ----------------------------------------------------------
     スクロールリビール
     ---------------------------------------------------------- */
  function setupScrollReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.rv').forEach(function (el) {
        el.classList.add('on');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('on');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -40px 0px'
    });

    document.querySelectorAll('.rv').forEach(function (el) {
      observer.observe(el);
    });
  }


  /* ----------------------------------------------------------
     スムーズスクロール
     ---------------------------------------------------------- */
  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href === '#' || href.length < 2) return;

        var target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          var top = target.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
    });
  }


  /* ----------------------------------------------------------
     フローティング予約ボタン（ヒーローを過ぎたら表示）
     ---------------------------------------------------------- */
  function setupFloatingButton() {
    var btn = document.querySelector('.floating-ctas');
    var hero = document.querySelector('.hero');
    if (!btn || !hero) return;

    var ticking = false;

    function update() {
      var heroBottom = hero.offsetHeight - 100;
      btn.classList.toggle('is-visible', window.scrollY > heroBottom);
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    update();
  }


  /* ----------------------------------------------------------
     モーダル制御
     ---------------------------------------------------------- */
  function setupModal() {
    var modal = document.getElementById('reserveModal');
    var openBtns = document.querySelectorAll('.js-open-modal');
    var closeBtns = document.querySelectorAll('.js-close-modal');
    if (!modal) return;

    function openModal(e) {
      // ボタンに data-plan があれば該当プランを選択
      var trigger = e && e.currentTarget;
      var plan = trigger && trigger.dataset && trigger.dataset.plan;
      if (plan) {
        var planSelect = document.getElementById('form-plan');
        if (planSelect) {
          planSelect.value = plan;
          // ペア/通常モードを切り替え
          if (typeof switchGenderMode === 'function') {
            switchGenderMode(plan);
          }
        }
      }

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      lockBodyScroll();

      // 履歴にstateを追加（Androidの戻るボタンでモーダルを閉じる）
      if (!window.history.state || !window.history.state.modalOpen) {
        window.history.pushState({ modalOpen: true }, '');
      }

      // 空き状況を先読み（バックグラウンドで取得）
      fetchAvailability();

      // 空きNoticeをリセット
      var notice = document.getElementById('availabilityNotice');
      if (notice) {
        notice.hidden = true;
        notice.className = 'availability-notice';
      }

      // フォームの最初の入力にフォーカス
      setTimeout(function () {
        var firstInput = modal.querySelector('input:not([type="checkbox"]):not([type="radio"])');
        if (firstInput && !document.getElementById('modalSuccessView').hidden) {
          firstInput.focus();
        }
      }, 300);
    }

    function closeModal(skipHistory) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();

      // 履歴stateを戻す（ユーザークリックによるクローズ時のみ）
      if (!skipHistory && window.history.state && window.history.state.modalOpen) {
        window.history.back();
      }

      // 成功画面を閉じたらフォームに戻す
      var formView = document.getElementById('modalFormView');
      var successView = document.getElementById('modalSuccessView');
      if (successView && !successView.hidden) {
        setTimeout(function () {
          successView.hidden = true;
          formView.hidden = false;
          var form = document.getElementById('reserveForm');
          if (form) form.reset();
        }, 300);
      }
    }

    openBtns.forEach(function (btn) {
      btn.addEventListener('click', openModal);
    });

    closeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(false); });
    });

    // ブラウザの戻るボタン（Androidのシステム戻るも含む）でモーダルを閉じる
    window.addEventListener('popstate', function (e) {
      if (modal.classList.contains('is-open')) {
        closeModal(true); // history操作せずにモーダルだけ閉じる
      }
    });

    // ESCキーで閉じる
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal(false);
      }
    });
  }


  /* ----------------------------------------------------------
     プライバシー / 特商法モーダル
     ---------------------------------------------------------- */
  function setupDocModals() {
    var docs = [
      { trigger: '.js-open-privacy', modal: 'privacyModal' },
      { trigger: '.js-open-tokutei', modal: 'tokuteiModal' }
    ];

    docs.forEach(function (doc) {
      var triggers = document.querySelectorAll(doc.trigger);
      var modal = document.getElementById(doc.modal);
      if (!modal) return;

      triggers.forEach(function (trigger) {
        trigger.addEventListener('click', function (e) {
          e.preventDefault();
          modal.classList.add('is-open');
          modal.setAttribute('aria-hidden', 'false');
          lockBodyScroll();
          // スクロール位置を一番上に
          var content = modal.querySelector('.modal-content');
          if (content) content.scrollTop = 0;
        });
      });
    });

    // 共通の閉じる処理
    document.querySelectorAll('.js-close-doc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = btn.closest('.modal--doc');
        if (modal) {
          modal.classList.remove('is-open');
          modal.setAttribute('aria-hidden', 'true');
          unlockBodyScroll();
        }
      });
    });

    // ESCキーで閉じる
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal--doc.is-open').forEach(function (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        unlockBodyScroll();
      });
    });
  }


  /* ----------------------------------------------------------
     プラン選択に応じたエリア/ペア切り替え
     ---------------------------------------------------------- */
  function setupPlanGenderSwitch() {
    var planSelect = document.getElementById('form-plan');
    if (!planSelect) return;

    planSelect.addEventListener('change', function () {
      switchGenderMode(planSelect.value);
    });

    // 初期化（プランが既に設定されている場合）
    switchGenderMode(planSelect.value);
  }

  function switchGenderMode(planValue) {
    var isPair = planValue && planValue.indexOf('ペア') !== -1;
    var radioGroup = document.getElementById('genderRadioGroup');
    var label = document.getElementById('genderLabel');
    var peopleSelect = document.getElementById('form-people');
    if (!radioGroup || !label) return;

    var singleRadios = radioGroup.querySelectorAll('[data-mode="single"]');
    var pairRadios = radioGroup.querySelectorAll('[data-mode="pair"]');

    if (isPair) {
      // ペアモードに切り替え
      label.innerHTML = 'ペアの組み合わせ <span class="req">*</span>';
      radioGroup.setAttribute('aria-label', 'ペアの組み合わせ');
      radioGroup.classList.add('is-pair');

      singleRadios.forEach(function (el) {
        el.hidden = true;
        var input = el.querySelector('input');
        if (input) {
          input.disabled = true;
          input.checked = false;
        }
      });
      pairRadios.forEach(function (el) {
        el.hidden = false;
        var input = el.querySelector('input');
        if (input) input.disabled = false;
      });

      // 人数を2名固定にする
      if (peopleSelect) {
        peopleSelect.value = '2';
        peopleSelect.disabled = true;
      }
    } else {
      // 通常モード
      label.innerHTML = 'ご利用エリア <span class="req">*</span>';
      radioGroup.setAttribute('aria-label', 'ご利用エリア');
      radioGroup.classList.remove('is-pair');

      pairRadios.forEach(function (el) {
        el.hidden = true;
        var input = el.querySelector('input');
        if (input) {
          input.disabled = true;
          input.checked = false;
        }
      });
      singleRadios.forEach(function (el) {
        el.hidden = false;
        var input = el.querySelector('input');
        if (input) input.disabled = false;
      });

      // 人数の固定を解除
      if (peopleSelect) {
        peopleSelect.disabled = false;
      }
    }

    // 空き状況Noticeをリセット
    var notice = document.getElementById('availabilityNotice');
    if (notice) {
      notice.hidden = true;
      notice.className = 'availability-notice';
    }
  }


  /* ----------------------------------------------------------
     予約枠の空き確認（GAS連携）
     ---------------------------------------------------------- */
  function fetchAvailability() {
    // キャッシュがあればそれを返す
    if (availabilityCache) return Promise.resolve(availabilityCache);

    if (!GAS_URL || GAS_URL.indexOf('YOUR_DEPLOYMENT_ID') !== -1) {
      console.warn('GAS_URL is not configured. Availability check skipped.');
      return Promise.resolve(null);
    }

    return fetch(GAS_URL + '?action=availability')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        availabilityCache = data;
        return data;
      })
      .catch(function (err) {
        console.warn('Availability fetch failed:', err);
        return null;
      });
  }

  function setupAvailabilityCheck() {
    var genderRadios = document.querySelectorAll('input[name="gender"]');
    var dateInput = document.getElementById('form-date');
    var notice = document.getElementById('availabilityNotice');
    var submitBtn = document.querySelector('.form-submit');

    if (!notice || !dateInput || genderRadios.length === 0) return;

    function showNotice(state, html) {
      notice.hidden = false;
      notice.className = 'availability-notice is-' + state;
      var textEl = notice.querySelector('.availability-text');
      if (textEl) textEl.innerHTML = html;
    }

    function hideNotice() {
      notice.hidden = true;
      notice.className = 'availability-notice';
    }

    function getSelectedGender() {
      var checked = document.querySelector('input[name="gender"]:checked');
      return checked ? checked.value : null;
    }

    function checkAvailability() {
      var gender = getSelectedGender();
      var date = dateInput.value;

      // 性別も日付も未選択ならNoticeを隠す
      if (!gender || !date) {
        hideNotice();
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      showNotice('loading', '空き状況を確認しています...');

      fetchAvailability().then(function (data) {
        // 取得失敗時は通常フローで続行
        if (!data || data.result !== 'success' || !data.fullDates) {
          hideNotice();
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // 性別/ペアタイプに応じて、どちらの空き枠を確認するか決定
        var checks = [];
        if (gender === '男性' || gender === '男性ペア') {
          checks.push({ key: 'male', label: '男性エリア' });
        } else if (gender === '女性' || gender === '女性ペア') {
          checks.push({ key: 'female', label: '女性エリア' });
        } else if (gender === '男女ペア') {
          checks.push({ key: 'male', label: '男性エリア' });
          checks.push({ key: 'female', label: '女性エリア' });
        }

        var fullList = [];
        checks.forEach(function (chk) {
          var arr = data.fullDates[chk.key] || [];
          if (arr.indexOf(date) !== -1) fullList.push(chk.label);
        });

        if (fullList.length > 0) {
          showNotice(
            'full',
            '申し訳ございません。<strong>' + date + '</strong> の' + fullList.join('・') +
            'は<strong>満席</strong>のため、ご予約いただけません。別の日をお選びください。'
          );
          if (submitBtn) submitBtn.disabled = true;
        } else {
          showNotice(
            'ok',
            '<strong>' + date + '</strong> の' + gender +
            'は<strong>空きがございます</strong>。このままご予約にお進みください。'
          );
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    genderRadios.forEach(function (r) {
      r.addEventListener('change', checkAvailability);
    });
    dateInput.addEventListener('change', checkAvailability);
  }


  /* ----------------------------------------------------------
     予約フォーム送信（GAS連携）
     ---------------------------------------------------------- */
  function setupForm() {
    var form = document.getElementById('reserveForm');
    var formView = document.getElementById('modalFormView');
    var successView = document.getElementById('modalSuccessView');
    if (!form || !formView || !successView) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // バリデーション（モーダル内スクロール対応）
      if (!form.checkValidity()) {
        // 最初の無効な要素を見つけてモーダル内でスクロール
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) {
          // モーダル要素を取得
          var modal = form.closest('.modal');
          if (modal) {
            // モーダル内でスクロール（背景ではなくモーダルを動かす）
            var rect = firstInvalid.getBoundingClientRect();
            var modalRect = modal.getBoundingClientRect();
            var scrollTarget = modal.scrollTop + (rect.top - modalRect.top) - 100;
            modal.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
          }
          // ネイティブのバリデーションメッセージを表示
          firstInvalid.reportValidity();
        }
        return;
      }

      var submitBtn = form.querySelector('.form-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = '送信中...';

      // FormData → URLSearchParams に変換（GASで e.parameter として受け取れる）
      var params = new URLSearchParams();
      new FormData(form).forEach(function (value, key) {
        params.append(key, value);
      });

      fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',  // GASのCORS制約を回避
        body: params
      })
      .then(function () {
        // no-corsモードではレスポンスを読めないため、送信完了で成功とみなす
        formView.hidden = true;
        successView.hidden = false;
        // キャッシュを無効化（次回予約時に最新データを取得）
        availabilityCache = null;
      })
      .catch(function (error) {
        console.error('Submission error:', error);
        alert('送信に失敗しました。お電話でのご予約もお試しください: 03-1234-5678');
        submitBtn.disabled = false;
        submitBtn.textContent = '仮予約を申し込む';
      });
    });
  }


  /* ----------------------------------------------------------
     日付入力の最小値を今日にセット
     ---------------------------------------------------------- */
  function setupDateMin() {
    var dateInput = document.getElementById('form-date');
    if (!dateInput) return;

    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = yyyy + '-' + mm + '-' + dd;
  }

})();