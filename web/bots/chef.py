# Chef-Bot – der Endgegner des Trainings: Railgun, Turbo, Radar und ein Gedächtnis.
gesehen = {}      # Gegner-Name -> letzte bekannte Position (ein Dictionary!)


def fahre_zu(robot, x, y, schnell):
    richtung = robot.path_to(x, y)
    if richtung is None:
        robot.turn_left()
    elif robot.dir != richtung:
        robot.face(richtung)
    elif schnell and robot.ready("dash"):
        robot.dash()
    elif robot.front_is_clear():
        robot.move()
    else:
        robot.turn_left()


def update(robot):
    feinde = robot.scan()
    for f in feinde:
        gesehen[f["name"]] = (f["x"], f["y"])

    if robot.enemy_ahead():
        if robot.ready("railgun"):
            robot.fire_railgun()
        else:
            robot.shoot()
        return

    if feinde and feinde[0]["richtung"] is not None:
        robot.face(feinde[0]["richtung"])
        return

    if feinde:
        ziel = (feinde[0]["x"], feinde[0]["y"])
    elif gesehen:
        ziel = list(gesehen.values())[0]
    else:
        ziel = (robot.arena_width // 2, robot.arena_height // 2)
    fahre_zu(robot, ziel[0], ziel[1], schnell=robot.hp > 6)
