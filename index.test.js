const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Vintroja Game Unit Tests', () => {
    let window;
    let document;
    let testEnv;

    beforeEach(() => {
        // 1. Read the HTML file
        const htmlPath = path.resolve(__dirname, './index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        // 2. Extract the script content and remove it from the parsed HTML string
        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
        let scriptContent = scriptMatch ? scriptMatch[1] : '';
        const htmlWithoutScript = html.replace(/<script>[\s\S]*?<\/script>/, '');

        // 3. Append code dynamically to expose internal let/const variables to the window object for testing
        scriptContent += `
            window.testEnv = {
                player,
                Obstacle,
                obstacles,
                update,
                startGame,
                endGame,
                resetGame,
                handleStart,
                handleEnd,
                getScore: () => score,
                getRunning: () => running,
                getGameover: () => gameover,
                getGameSpeed: () => gameSpeed,
                getJumpBuffer: () => jumpBuffer,
                getGravity: () => gravity,
                getJumpStrength: () => jumpStrength,
                getGroundY: () => groundY
            };
        `;

        // 4. Create JSDOM instance
        const dom = new JSDOM(htmlWithoutScript, {
            runScripts: "dangerously",
        });
        
        window = dom.window;
        document = window.document;

        // 5. Mock Canvas API and globals before the script runs
        const mockContext = {
            clearRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillText: jest.fn(),
            font: '',
            textAlign: '',
            textBaseline: '',
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 0
        };
        window.HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);
        window.requestAnimationFrame = jest.fn();
        window.performance = { now: jest.fn(() => 0) };

        // 6. Execute the modified script within the simulated DOM
        const scriptEl = document.createElement('script');
        scriptEl.textContent = scriptContent;
        document.body.appendChild(scriptEl);
        
        testEnv = window.testEnv;
    });

    test('Player initializes correctly', () => {
        expect(testEnv.player.x).toBe(100);
        expect(testEnv.player.y).toBe(testEnv.getGroundY());
        expect(testEnv.player.dy).toBe(0);
        expect(testEnv.player.grounded).toBe(false); 
    });

    test('Player falls due to gravity and stops at ground', () => {
        const { player, update, getGroundY } = testEnv;
        
        player.y = 400; // Move player in the air
        player.dy = 0;

        update(0.1); // Simulate frame

        expect(player.dy).toBeGreaterThan(0);
        expect(player.y).toBeGreaterThan(400);

        player.y = getGroundY() + 10; // Push beneath the ground
        update(0.1); // Simulate frame

        expect(player.y).toBe(getGroundY());
        expect(player.dy).toBe(0);
        expect(player.grounded).toBe(true);
    });

    test('Player jumps when jump is triggered and grounded', () => {
        const { player, update, handleStart, getGroundY } = testEnv;
        
        // Settle player on the ground
        player.y = getGroundY() + 10;
        update(0.1); 
        expect(player.grounded).toBe(true);

        // Trigger jump input
        handleStart({ type: 'mousedown', preventDefault: jest.fn() });

        update(0.1);

        expect(player.grounded).toBe(false);
        expect(player.dy).toBeLessThan(0); // Going upward
    });

    test('Obstacles are spawned properly', () => {
        const { update, obstacles } = testEnv;
        expect(obstacles.length).toBe(0);

        // First update immediately spawns an obstacle because obstacleTimer starts at 0
        update(0.1);
        expect(obstacles.length).toBe(1);
    });

    test('Obstacles move to the left during update', () => {
        const { update, obstacles } = testEnv;

        update(0.1); // Spawn obstacle
        const initialX = obstacles[0].x;
        
        update(0.1); // Move obstacle
        expect(obstacles[0].x).toBeLessThan(initialX);
    });

    test('Game over when player collides with obstacle', () => {
        const { player, update, obstacles, getGameover } = testEnv;
        obstacles.length = 0;
        
        const obs = new testEnv.Obstacle();
        obs.x = player.x + 5; // Intersect heavily
        obs.y = player.y;
        obstacles.push(obs);

        update(0.1);
        expect(getGameover()).toBe(true);
    });

    test('Score increases and game speeds up when passing an obstacle', () => {
        const { player, update, obstacles, getScore, getGameSpeed } = testEnv;
        obstacles.length = 0;
        
        const initialSpeed = getGameSpeed();
        const obs = new testEnv.Obstacle();
        obs.x = player.x - obs.w - 1; // Position directly behind the player
        obstacles.push(obs);

        const initialScore = getScore();
        update(0.1); 

        expect(getScore()).toBe(initialScore + 25);
        expect(obstacles[0].passed).toBe(true);
        expect(getGameSpeed()).toBeGreaterThan(initialSpeed);
    });
});
