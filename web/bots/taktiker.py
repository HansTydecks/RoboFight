# Taktiker – nutzt Schild und Raketen klug und sucht dich in der Mitte.
def fahre_zu(robot, x, y):
    richtung = robot.path_to(x, y)
    if richtung is None:
        robot.turn_left()
    elif robot.dir != richtung:
        robot.face(richtung)
    elif robot.front_is_clear():
        robot.move()
    else:
        robot.turn_left()


def update(robot):
    ziel = robot.nearest_enemy()
    if ziel is None:
        fahre_zu(robot, robot.arena_width // 2, robot.arena_height // 2)
        return
    if robot.enemy_ahead():
        if ziel["distanz"] <= 3 and robot.ready("shield") and not robot.shield_active:
            robot.shield()
        elif ziel["distanz"] >= 2 and robot.ready("rocket"):
            robot.fire_rocket()
        else:
            robot.shoot()
        return
    if ziel["richtung"] is not None:
        robot.face(ziel["richtung"])
        return
    fahre_zu(robot, ziel["x"], ziel["y"])
