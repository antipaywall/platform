// Runs before the page is drawn, so the hero can start covered by the wall instead of
// flashing its content first. If the wall script never arrives, the content is shown anyway.
document.documentElement.classList.add('js');
setTimeout(function () {
  document.documentElement.classList.add('wall-ready');
}, 2500);
