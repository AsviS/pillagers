var util = require('util');
var Ship = require('./ship');
var Bullet = require('./bullet');
var chem = require('chem');
var v = chem.vec2d;
var sfx = require('./sfx');

module.exports = RangerShip;


util.inherits(RangerShip, Ship);
function RangerShip(state, o) {
  Ship.call(this, state, o);
  this.radius = 16;
  this.hasBackwardsThrusters = false;
  this.rotationSpeed = Math.PI * 0.02;
  this.thrustAmt = 0.05;
  this.rankOrder = 1;
  this.sensorRange = 400;

  this.shootInput = false;
  this.hasBullets = true;
  this.bulletSpeed = 10;
  this.bulletLife = 0.5;
  this.bulletDensity = 0.002;
  this.bulletDamage = 0.05;
  this.bulletAnimationName = 'bullet/small';
  this.bulletSfx = sfx.shootWeakBullet;
  this.rechargeAmt = 0.20;
  this.recharge = 0;

  this.standGround = false; // true if can only fire when moving
}

RangerShip.prototype.name = "Ranger";

RangerShip.prototype.animationNames = {
  accel: 'ship_ranger_accel',
  decel: 'ship_ranger_decel',
  still: 'ship_ranger_still',
};

RangerShip.prototype.update = function(dt, dx) {
  Ship.prototype.update.apply(this, arguments);
  this.recharge -= dt;
  if (this.shootInput && this.readyToFire()) {
    this.recharge = this.rechargeAmt;
    this.createProjectile();
  }
}

RangerShip.prototype.readyToFire = function() {
  if (this.recharge > 0) return false;
  if (this.standGround && this.vel.lengthSqrd() > 0) return false;
  return true;
};

RangerShip.prototype.clearInput = function() {
  Ship.prototype.clearInput.apply(this, arguments);

  this.shootInput = false;
}

RangerShip.prototype.gunPositions = function() {
  return [this.pos.plus(v.unit(this.rotation).scaled(this.radius))];
};

RangerShip.prototype.createProjectile = function() {
  this.bulletSfx();
  var positions = this.gunPositions();
  for (var i = 0; i < positions.length; i += 1) {
    var pos = positions[i];
    var bullet = new Bullet(this.state, {
      pos: pos,
      vel: v.unit(this.rotation).scaled(this.bulletSpeed).add(this.vel),
      team: this.team,
      density: this.bulletDensity,
      damageAmount: this.bulletDamage,
      life: this.bulletLife,
      animationName: this.bulletAnimationName,
    });
    this.state.addBullet(bullet);
  }
}
