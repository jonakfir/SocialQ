<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let difficulty = '2';
    let stats = [
        { date: '2025-07-15', score: '8/10', difficulty: '2' },
        { date: '2025-07-16', score: '9/10', difficulty: '1' },
        { date: '2025-07-17', score: '7/10', difficulty: '3' }
    ];

    function beginGame() {
        goto(`/mirroring/mirroring?difficulty=${difficulty}`);
    }

    function goToDashboard() {
        goto('/dashboard');
    }
</script>

<style>
    .page-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        position: relative;
    }

    .dashboard-box {
        width: 500px; /* narrowed from before */
        padding: 30px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        text-align: center;
    }

	.settings-title {
		font-family: 'Georgia', serif;
		font-size: 3rem;
		color: white;
		-webkit-text-stroke: 2px rgba(0, 0, 0, 0.5);
		text-shadow: 0 10px 10px rgba(0, 0, 0, 0.4);
		margin-bottom: 20px;
	}

    table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 16px;
    }

    th, td {
        padding: 12px;
        text-align: center;
        border-bottom: 1px solid rgba(0, 0, 0, 0.2);
    }

    th {
        background-color: rgba(255, 255, 255, 0.6);
        font-weight: bold;
    }

    td {
        background-color: rgba(255, 255, 255, 0.4);
    }

    .settings-btn {
        display: block;
        width: 80%;
        margin: 10px auto;
        padding: 10px 20px;
        font-size: 16px;
        font-weight: bold;
        border: none;
        border-radius: 30px;
        cursor: pointer;
        background-color: #4f46e5;
        color: white;
        transition: background-color 0.3s;
    }

    .settings-btn:hover {
        background-color: #4338ca;
    }

    .settings-btn:nth-of-type(2) {
        background-color: white;
        color: black;
        border: 2px solid black;
    }

    .settings-btn:nth-of-type(2):hover {
        background-color: rgba(0, 0, 0, 0.05);
    }
</style>

<!-- Background Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<!-- Glass container -->
<div class="page-container">
    <div class="dashboard-box">
        <h2 class="settings-title">Mirroring Game</h2>
        <!-- <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Score</th>
                </tr>
            </thead>
            <tbody>
                {#each stats as stat}
                    <tr>
                        <td>{stat.date}</td>
                        <td>{stat.score}</td>
                    </tr>
                {/each}
            </tbody>
        </table> -->

        <button class="settings-btn" on:click={beginGame}>Let's Begin</button>
        <button class="settings-btn" on:click={goToDashboard}>Main Menu</button>
    </div>
</div>
