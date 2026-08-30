import { describe, it, expect } from "vitest";
import { generateFit } from "../src/fit";
import { lookupExercise } from "../src/mapper";
import { Decoder, Stream } from "@garmin/fitsdk";
import workout from "./fixtures/workout.json";

describe("generateFit — Python parity + valid FIT", () => {
  it("matches Python fit.py stats and produces a decodable FIT", () => {
    const r = generateFit(workout as any, [110, 115, 120, 118, 122, 119]);
    // Python-verified stats
    expect(r.exercises).toBe(3);
    expect(r.total_sets).toBe(10);
    expect(r.calories).toBe(622);
    expect(r.avg_hr).toBe(117);
    expect(r.duration_s).toBe(4102);
    // Valid Garmin FIT
    const stream = Stream.fromByteArray(Buffer.from(r.fit));
    expect(Decoder.isFIT(stream)).toBe(true);
    const dec = new Decoder(stream);
    expect(dec.checkIntegrity()).toBe(true);
    const { messages, errors } = dec.read();
    expect(errors.length).toBe(0);
    expect(messages.setMesgs.length).toBe(19); // 10 active + 9 rest
    expect(messages.sessionMesgs[0].totalCalories).toBe(622);
    expect(messages.sessionMesgs[0].subSport).toBe("strengthTraining");
    expect(messages.exerciseTitleMesgs.length).toBe(3);
  });
});

describe("lookupExercise — exercise map", () => {
  it("resolves template-id + name; sentinel for unknown", () => {
    expect(lookupExercise("Incline Bench Press (Dumbbell)", "07B38369").category).not.toBe(65534);
    expect(lookupExercise("Totally Made Up Exercise", null).category).toBe(65534);
  });
});
