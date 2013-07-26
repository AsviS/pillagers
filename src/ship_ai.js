var chem = require('chem');
var v = chem.vec2d;
var createId = require('./uuid').createId;

module.exports = ShipAi;

function ShipAi(state, ship) {
  this.state = state;
  this.id = createId();
  this.ship = ship;

  this.commands = [];

  subscribeToShipEvents(this);
}

function subscribeToShipEvents(self) {
  self.ship.on('deleted', function() {
    self.delete();
  });
}

ShipAi.prototype.delete = function() {
  while (this.commands.length) {
    this.commands.shift().delete();
  }
  this.state.deleteAi(this);
};

ShipAi.prototype.update = function (dt, dx) {
  var cmd = this.commands[0];

  if (cmd) {
    cmd.execute(this, dt, dx);
    if (cmd.done) {
      this.commands.shift().delete();
      this.ship.clearInput();
    }
    return;
  }

  if (! this.attackNearbyEnemy()) this.decelerate();
}

ShipAi.prototype.pointTowardDirection = function(targetDir) {
  var targetAngle = targetDir.angle();
  var delta = angleSubtract(targetAngle, this.ship.rotation);
  this.ship.setRotateInput(delta / this.ship.rotationSpeed);
};

ShipAi.prototype.decelerate = function() {
  var speed = this.ship.vel.length();
  if (speed === 0) {
    this.ship.setThrustInput(0, true);
    this.ship.setRotateInput(0);
    return;
  }

  // point directly at velocity
  var targetDir = this.ship.vel.normalized();
  var negativeTarget = false;
  if (!this.ship.hasBackwardsThrusters) {
    // point against the velocity
    targetDir.neg();
    negativeTarget = true;
  }
  var targetAngle = targetDir.angle();
  var delta = angleSubtract(targetAngle, this.ship.rotation);
  if (Math.abs(delta) !== 0) {
    this.ship.setRotateInput(delta / this.ship.rotationSpeed);
    this.ship.setThrustInput(0, true);
    return;
  }

  var thrustInput = Math.min(speed / this.ship.thrustAmt, 1);
  if (!negativeTarget) thrustInput = -thrustInput;
  this.ship.setThrustInput(thrustInput, true);
};

ShipAi.prototype.attackNearbyEnemy = function() {
  var target = null;
  var closestDist;
  for (var id in this.state.physicsObjects) {
    var obj = this.state.physicsObjects[id];
    if (!obj.canBeShot) continue;
    if (obj.team == null || obj.team === this.ship.team) continue;
    var dist = obj.pos.distanceSqrd(this.ship.pos);
    if (dist > this.ship.sensorRange * this.ship.sensorRange) continue;
    if (target == null || dist < closestDist) {
      closestDist = dist;
      target = obj;
    }
  }
  if (target) {
    this.commandToAttack(target, false);
    return true;
  }
  return false;
};

ShipAi.prototype.draw = function(context) {
  for (var i = 0; i < this.commands.length; i += 1) {
    this.commands[i].draw(this, context);
  }
};

ShipAi.prototype.clearCommands = function() {
  this.commands.forEach(function(cmd) {
    cmd.delete();
  });
  this.commands = [];
  this.ship.clearInput();
};

ShipAi.prototype.commandToPoint = function(dir, queue) {
  if (! queue) this.clearCommands();
  this.commands.push(new PointCommand(dir));
};

ShipAi.prototype.commandToMove = function(pt, queue, loose) {
  if (! queue) this.clearCommands();
  if (loose) {
    this.commands.push(new EngageCommand(this, pt));
  } else {
    this.commands.push(new MoveCommand(this, pt));
  }
};

ShipAi.prototype.commandToEnter = function(target, queue) {
  if (! queue) this.clearCommands();
  this.commands.push(new EnterCommand(this, target));
};

ShipAi.prototype.commandToAttack = function(target, queue) {
  if (! queue) this.clearCommands();
  if (this.ship.hasBullets) {
    if (this.ship.standGround) {
      this.commands.push(new DefendGroundCommand(this, target));
    } else {
      this.commands.push(new ShootCommand(this, target));
    }
  } else if (this.ship.hasMelee) {
    this.commands.push(new MeleeCommand(this, target));
  }
};

ShipAi.prototype.calcStopDistance = function() {
  // returns the distance the ship will travel before it comes to a rest if we
  // try to stop right now.
  if (this.ship.vel.lengthSqrd() === 0) return 0;
  var againstVelDir = this.ship.vel.normalized();
  if (!this.ship.hasBackwardsThrusters) againstVelDir.neg();
  var againstVelAngle = againstVelDir.angle();
  var delta = angleSubtract(againstVelAngle, this.ship.rotation);
  var timeToReorient = Math.abs(delta) / this.ship.rotationSpeed;

  var speed = this.ship.vel.length();
  var distance = timeToReorient * speed;
  distance += speed * speed / (2 * this.ship.thrustAmt);
  return distance;
};

function sign(x) {
  if (x > 0) {
    return 1;
  } else if (x < 0) {
    return -1;
  } else {
    return 0;
  }
}

function angleSubtract(left, right) {
  // subtract right from left and return the smallest absolute correct answer
  // 359 - 1 should equal -2 (except in radians)
  var delta = left - right;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

function PointCommand(dir) {
  this.dir = dir;
  this.done = false;
}

PointCommand.prototype.execute = function(ai, dt, dx) {
  var targetAngle = this.dir.angle();
  var delta = angleSubtract(targetAngle, ai.ship.rotation);
  ai.ship.setRotateInput(delta / ai.ship.rotationSpeed);
  this.done = Math.abs(delta) < Math.PI / 20;
};

PointCommand.prototype.draw = function(ai, context) { };
PointCommand.prototype.delete = function() { };

function EngageCommand(ai, dest) {
  // move to an area, but don't worry about formation. just get close to dest.
  this.thresholdSqrd = 100 * 100; // stop when distanceSqrd < this
  this.dest = dest;
  this.done = false;
  this.speedCap = 3;
  this.sprite = new chem.Sprite('knife', {
    batch: ai.state.batch,
    pos: this.dest,
  });
}

EngageCommand.prototype.execute = function(ai, dt, dx) {
  var distSqrd = ai.ship.pos.distanceSqrd(this.dest);
  var closeEnough = distSqrd < this.thresholdSqrd;

  if (closeEnough) {
    this.done = true;
    return;
  }

  if (ai.attackNearbyEnemy()) {
    this.done = true;
    return;
  }

  var relTargetPt = this.dest.minus(ai.ship.pos);
  var targetDir = relTargetPt.normalized();
  var actualDir = v.unit(ai.ship.rotation);

  // consider the distance we would travel if we tried to stop right now.
  // if that distance is further than the destination, stop now.
  var stopDistance = ai.calcStopDistance();
  if (stopDistance > 0) {
    // find stopPoint which is relative to ship position
    var relStopPoint = ai.ship.vel.normalized().scale(stopDistance);
    // figure out which direction to point
    var newTargetDir = relTargetPt.minus(relStopPoint).normalize();
    // never point backwards
    if (ai.ship.hasBackwardsThrusters || newTargetDir.dot(targetDir) >= 0) targetDir = newTargetDir;
  }
  if (actualDir.dot(targetDir) > 0.99) {
    // thrusting would get us closer to our target
    this.setThrustWithCap(ai, 1);
    ai.pointTowardDirection(targetDir);
  } else if (ai.ship.hasBackwardsThrusters && actualDir.dot(targetDir) < -0.99) {
    // thrusting backwards would get us closer to our target
    this.setThrustWithCap(ai, -1);
    ai.pointTowardDirection(targetDir.clone().neg());
  } else if (ai.ship.hasBackwardsThrusters && actualDir.dot(targetDir) < 0) {
    ai.ship.setThrustInput(0);
    ai.pointTowardDirection(targetDir.clone().neg());
  } else {
    ai.ship.setThrustInput(0);
    ai.pointTowardDirection(targetDir);
  }
};

EngageCommand.prototype.setThrustWithCap = function(ai, thrustInput) {
  if (thrustInput === 0) {
    ai.ship.setThrustInput(thrustInput);
    return;
  }
  var speedSqrd = ai.ship.vel.lengthSqrd();
  var atSpeedcap = speedSqrd > this.speedCap * this.speedCap;
  if (! atSpeedcap) {
    ai.ship.setThrustInput(thrustInput);
    return;
  }
  var actualDir = v.unit(ai.ship.rotation);
  var thrustWouldIncreaseSpeed = actualDir.dot(ai.ship.vel) > 0;
  if (thrustInput < 0) thrustWouldIncreaseSpeed = !thrustWouldIncreaseSpeed;
  if (thrustWouldIncreaseSpeed) return;
  ai.ship.setThrustInput(thrustInput);
};

EngageCommand.prototype.draw = function(ai, context) {
  this.sprite.setVisible(ai.ship.selected);
};

EngageCommand.prototype.delete = function() {
  this.sprite.delete();
};

function EnterCommand(ai, target) {
  this.target = target;
  this.done = false;
  this.speedCap = 9999;
}

EnterCommand.prototype.execute = function(ai, dt, dx) {
  interceptTarget.call(this, ai, dt, dx);
  ai.ship.enterInput = this.target;
};

EnterCommand.prototype.draw = function(ai, context) { };

EnterCommand.prototype.delete = function() { };

function MoveCommand(ai, dest) {
  this.dest = dest;
  this.done = false;
  this.threshold = Math.pow(6, 2); // stop when distanceSqrd < this
  this.sprite = new chem.Sprite('flag', {
    batch: ai.state.batch,
    pos: this.dest,
  });
}

MoveCommand.prototype.execute = function(ai, dt, dx) {
  var relTargetPt = this.dest.minus(ai.ship.pos);
  var targetDir = relTargetPt.normalized();
  var actualDir = v.unit(ai.ship.rotation);
  var closeEnough = ai.ship.pos.distanceSqrd(this.dest) < this.threshold;

  // consider the distance we would travel if we tried to stop right now.
  // if that distance is further than the destination, stop now.
  var stopDistance = ai.calcStopDistance();
  if (stopDistance > 0) {
    // find stopPoint which is relative to ship position
    var relStopPoint = ai.ship.vel.normalized().scale(stopDistance);
    // figure out which direction to point
    targetDir = relTargetPt.minus(relStopPoint).normalize();
  }
  if (closeEnough) {
    ai.decelerate();
  } else if (actualDir.dot(targetDir) > 0.99) {
    // thrusting would get us closer to our target
    ai.ship.setThrustInput(1);
    ai.pointTowardDirection(targetDir);
  } else if (ai.ship.hasBackwardsThrusters && actualDir.dot(targetDir) < -0.99) {
    // thrusting backwards would get us closer to our target
    ai.ship.setThrustInput(-1);
    ai.pointTowardDirection(targetDir.clone().neg());
  } else if (ai.ship.hasBackwardsThrusters && actualDir.dot(targetDir) < 0) {
    ai.ship.setThrustInput(0);
    ai.pointTowardDirection(targetDir.clone().neg());
  } else {
    ai.ship.setThrustInput(0);
    ai.pointTowardDirection(targetDir);
  }
  var stopped = ai.ship.vel.lengthSqrd() === 0;
  this.done = stopped && closeEnough;
};

MoveCommand.prototype.draw = function(ai, context) {
  this.sprite.setVisible(ai.ship.selected);
};

MoveCommand.prototype.delete = function() {
  this.sprite.delete();
};


function ShootCommand(ai, target) {
  // pursue and shoot lazers at target
  this.done = false;
  this.target = target;
  this.speedCap = 4;
}

ShootCommand.prototype.execute = function(ai, dt, dx) {
  // un-target dead ships
  if (this.target.deleted) {
    this.done = true;
    return;
  }

  var relTargetPt = this.target.pos.minus(ai.ship.pos);
  var targetAngle = relTargetPt.angle();
  var delta = angleSubtract(targetAngle, ai.ship.rotation);
  var goodShot = Math.abs(delta) < Math.PI / 10;
  var targetDir = relTargetPt.normalized();
  var actualDir = v.unit(ai.ship.rotation);
  var adjustedBulletVel = ai.ship.vel.plus(targetDir.scaled(ai.ship.bulletSpeed)).minus(this.target.vel);
  var bulletRange = adjustedBulletVel.length() * ai.ship.bulletLife * 60;
  var withinRange = ai.ship.pos.distance(this.target.pos) < bulletRange;

  // shoot at target
  ai.ship.shootInput = goodShot && withinRange;

  if (! withinRange) {
    var stopDistance = ai.calcStopDistance();
    if (stopDistance > 0) {
      // find stopPoint which is relative to ship position
      var relStopPoint = ai.ship.vel.normalized().scale(stopDistance);
      // figure out which direction to point
      var newTargetDir = relTargetPt.minus(relStopPoint).normalize();
    }
  }
  ai.pointTowardDirection(targetDir);
  var thrust = (actualDir.dot(targetDir) > 0.99) ? 1 : 0;
  if (thrust > 0) {
    var speedSqrd = ai.ship.vel.lengthSqrd();
    var atSpeedcap = speedSqrd > this.speedCap * this.speedCap;
    if (atSpeedcap) {
      var thrustWouldIncreaseSpeed = actualDir.dot(ai.ship.vel) > 0;
      if (thrustWouldIncreaseSpeed) thrust = 0;
    }
  }
  ai.ship.setThrustInput(thrust);
};

ShootCommand.prototype.draw = function(ai, context) {};

ShootCommand.prototype.delete = function() {
  this.target = null;
};
function DefendGroundCommand(ai, target) {
  // stand your ground. do not move. shoot nearest target.
  this.done = false;
  this.target = target;
}

DefendGroundCommand.prototype.execute = function(ai, dt, dx) {
  // un-target dead ships
  if (this.target.deleted) {
    this.done = true;
    return;
  }
  // un-target far away ships
  if (this.target.pos.distanceSqrd(ai.ship.pos) > ai.ship.sensorRange * ai.ship.sensorRange) {
    this.done = true;
    return;
  }
  ai.ship.setThrustInput(0);

  var targetAngle = this.target.pos.minus(ai.ship.pos).angle();
  var delta = angleSubtract(targetAngle, ai.ship.rotation);
  var goodShot = Math.abs(delta) < Math.PI / 10;

  // shoot at target
  ai.ship.shootInput = goodShot ? 1 : 0;

  // aim at target
  ai.ship.setRotateInput(delta / ai.ship.rotationSpeed);
};

DefendGroundCommand.prototype.draw = function(ai, context) {};

DefendGroundCommand.prototype.delete = function() {
  this.target = null;
};

function interceptTarget(ai, dt, dx) {
  // un-target dead ships
  if (this.target.deleted) {
    this.done = true;
    return;
  }

  var relTargetPt = this.target.pos.minus(ai.ship.pos);
  var targetDir = relTargetPt.normalized();
  var actualDir = v.unit(ai.ship.rotation);
  var withinRange = ai.ship.pos.distance(this.target.pos) < ai.ship.meleeRadius + this.target.radius;

  if (!withinRange) {
    var stopDistance = ai.calcStopDistance();
    if (stopDistance > 0) {
      // find stopPoint which is relative to ship position
      var relStopPoint = ai.ship.vel.normalized().scale(stopDistance);
      // figure out which direction to point
      var newTargetDir = relTargetPt.minus(relStopPoint).normalize();
      // never try to go backwards
      if (newTargetDir.dot(targetDir) >= 0) targetDir = newTargetDir;
    }
  }
  ai.pointTowardDirection(targetDir);
  var thrust = (actualDir.dot(targetDir) > 0.99) ? 1 : 0;
  if (thrust > 0) {
    var speedSqrd = ai.ship.vel.lengthSqrd();
    var atSpeedcap = speedSqrd > this.speedCap * this.speedCap;
    if (atSpeedcap) {
      var thrustWouldIncreaseSpeed = actualDir.dot(ai.ship.vel) > 0;
      if (thrustWouldIncreaseSpeed) thrust = 0;
    }
  }
  ai.ship.setThrustInput(thrust);
}

function MeleeCommand(ai, target) {
  this.target = target;
  this.done = false;
  this.speedCap = 6;
}

MeleeCommand.prototype.execute = function(ai, dt, dx) {
  interceptTarget.call(this, ai, dt, dx);
  ai.ship.meleeInput = this.target;
};

MeleeCommand.prototype.draw = function(ai, context) {};

MeleeCommand.prototype.delete = function() {
  this.target = null;
};
