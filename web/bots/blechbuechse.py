# Blechbüchse – ein Übungs-Dummy. Dreht sich langsam im Kreis.
zug = 0

def update(robot):
    global zug
    zug += 1
    if zug % 3 == 0:
        robot.turn_right()
    else:
        robot.wait()
