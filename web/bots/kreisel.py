# Kreisel – dreht sich und schießt, sobald jemand vor ihm steht.
def update(robot):
    if robot.enemy_ahead():
        robot.shoot()
    else:
        robot.turn_right()
