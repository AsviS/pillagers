var chem = require('chem');
var v = chem.vec2d;

module.exports = TitleScreen;

function TitleScreen(game) {
  this.game = game;
  this.engine = game.engine;
  this.bg = chem.resources.images['title-screen.png'];
  this.titleImg = chem.resources.images['title.png'];
  this.batch = new chem.Batch();
  this.time = 0;
  this.options = [
    {
      caption: "Start New Campaign",
      fn: startNewCampaign.bind(this),
    },
    {
      caption: "Dogfighting Mode",
      fn: startDogfighting.bind(this),
    },
    {
      caption: "Sandbox Mode",
      fn: startSandboxMode.bind(this),
    },
    {
      caption: "Credits",
      fn: goToCredits.bind(this),
    },
    {
      caption: "Music: " + (this.game.musicOn ? "On": "Off"),
      fn: toggleMusic.bind(this),
    }
  ];
  initOptions(this);
}

function toggleMusic(option) {
  this.game.toggleMusic();
  option.label.text = "Music: " + (this.game.musicOn ? "On": "Off");
}

function startDogfighting() {
  this.delete();
  this.game.startDogfighting();
}

function startSandboxMode() {
  this.delete();
  this.game.startSandboxMode();
}

function startNewCampaign() {
  this.delete();
  this.game.startNewCampaign();
}

function goToCredits() {
  this.delete();
  this.game.showCredits();
}

function initOptions(self) {
  var pos = self.engine.size.scaled(0.5);
  self.options.forEach(function(option) {
    option.label = new chem.Label(option.caption, {
      pos: pos.clone(),
      fillStyle: "#ffffff",
      strokeStyle: "#ff0000",
      lineWidth: 2,
      font: "38px monospace",
      batch: self.batch,
      textAlign: 'center',
      textBaseline: 'middle',
    });
    pos.y += 60;
  });
}

TitleScreen.prototype.start = function() {
  this.engine.on('update', onUpdate.bind(this));
  this.engine.on('draw', onDraw.bind(this));
  this.engine.on('mousemove', onMouseMove.bind(this));
  this.engine.on('buttonup', onButtonUp.bind(this));
};

function onUpdate(dt, dx) {
  this.time += dt * 4;
}

function onDraw(context) {
  context.setTransform(1, 0, 0, 1, 0, 0); // load identity
  context.drawImage(this.bg, 0, 0);
  context.drawImage(this.titleImg, this.engine.size.x / 2 - this.titleImg.width / 2, 50 + 10 * Math.sin(this.time));

  this.batch.draw(context);
}

function onMouseMove() {
  var pt = this.engine.mousePos;
  for (var i = 0; i < this.options.length; i += 1) {
    var option = this.options[i];
    var hit = pt.y > option.label.pos.y - 30 && pt.y < option.label.pos.y + 30;
    option.label.stroke = hit;
  }
}

function onButtonUp(button) {
  if (button !== chem.button.MouseLeft) return;
  var pt = this.engine.mousePos;
  for (var i = 0; i < this.options.length; i += 1) {
    var option = this.options[i];
    var hit = pt.y > option.label.pos.y - 30 && pt.y < option.label.pos.y + 30;
    if (hit) {
      option.fn(option);
      break;
    }
  }
}

TitleScreen.prototype.delete = function() {
  this.engine.removeAllListeners();
};
