const hero = document.querySelector('.windows-hero');
const slider = hero.querySelector('input');

function reveal() {
  hero.style.setProperty('--reveal', `${slider.value}%`);
  slider.setAttribute('aria-valuetext', `${100 - slider.valueAsNumber}% after cleaning`);
}

slider.addEventListener('input', reveal);
reveal();
slider.hidden = false;

const reviews = document.querySelector('.customer-reviews');
const reviewTrack = reviews.querySelector('.review-list');
const reviewCopy = reviewTrack.firstElementChild.cloneNode(true);
reviewCopy.classList.add('review-copy');
reviewCopy.inert = true;
reviewCopy.setAttribute('aria-hidden', 'true');
reviewTrack.append(reviewCopy);
reviews.classList.add('is-looping');

const heroPhone = document.querySelector('#hero-phone .button');
const stickyHeader = document.querySelector('.site-header');
let phoneObserver;
function watchHeroPhone() {
  phoneObserver?.disconnect();
  phoneObserver = new IntersectionObserver(([entry]) => {
    document.documentElement.classList.toggle('hero-phone-visible', entry.isIntersecting && entry.intersectionRatio >= .5);
  }, { rootMargin: `-${stickyHeader.offsetHeight}px 0px 0px`, threshold: .5 });
  phoneObserver.observe(heroPhone);
}
watchHeroPhone();
new ResizeObserver(watchHeroPhone).observe(stickyHeader);
