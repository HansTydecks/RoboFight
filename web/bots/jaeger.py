# Jäger – sucht den nächsten Gegner, fährt um Wände herum hin und schießt.
def update(robot):
    ziel = robot.nearest_enemy()
    if ziel is None:
        robot.turn_right()
        return
    if robot.enemy_ahead():
        robot.shoot()
        return
    if ziel["richtung"] is not None:
        robot.face(ziel["richtung"])
        return
    fahre_zu(robot, ziel["x"], ziel["y"])


def fahre_zu(robot, x, y):
    richtung = robot.path_to(x, y)
    if richtung is None:
        robot.turn_right()
    elif robot.dir != richtung:
        robot.face(richtung)
    elif robot.front_is_clear():
        robot.move()
    else:
        robot.turn_right()
