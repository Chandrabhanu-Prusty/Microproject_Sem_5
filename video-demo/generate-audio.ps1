Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft David Desktop")
$synth.Rate = 0

$scripts = @(
  @{
    File = "video-demo/audio/01_intro.wav"
    Text = "Welcome to Marque, a production-ready serverless campus event management and real-time attendance system engineered on Amazon Web Services. Traditional campus event systems suffer from overselling during registration rushes, paper waste, and long door bottlenecks. Marque solves this using an event-driven AWS serverless architecture with Node.js 22, Amazon API Gateway, AWS Lambda, Amazon DynamoDB across six purpose-built tables, and Amazon S3."
  },
  @{
    File = "video-demo/audio/02_attendee_auth.wav"
    Text = "Let us begin with our first stakeholder: the student attendee. On the modern React 18 single-page application, students can explore upcoming campus hackathons, technical symposiums, and cultural events. Logging in as Chandrabhanu Prusty, the system authenticates the student via stateless cryptographic JSON Web Tokens, displaying real-time seat capacity bars and venue schedules."
  },
  @{
    File = "video-demo/audio/03_rsvp_ticket.wav"
    Text = "Next, the student reserves their seat. To eliminate race conditions and double-booking, Marque executes an atomic DynamoDB multi-item transaction using TransactWriteItems. This atomically increments the event confirmed count and creates an active ticket. Navigating to My Registrations, the attendee instantly receives a high-entropy, tamper-proof 2D QR ticket pass, complete with venue details and single-use validation instructions."
  },
  @{
    File = "video-demo/audio/04_waitlist.wav"
    Text = "What happens when an event reaches maximum physical capacity? Let us inspect the GDG Campus DevFest, which is currently full at 50 of 50 seats. When our student joins, Marque assigns a deterministic 1-based queue position using consistent range queries. If any confirmed attendee cancels, Marque's self-healing transaction automatically promotes the top waitlisted candidate and issues them an active pass."
  },
  @{
    File = "video-demo/audio/05_organizer.wav"
    Text = "Now, let us switch to our second stakeholder: the event organizer. Logging in as Neilsen Organizer, we access the Organizer Studio. Here, organizers create new campus events, set physical venue limits, and upload promotional banners directly to Amazon S3 via secure pre-signed URLs. Organizers also delegate gate authority by assigning student volunteers as authorized check-in coordinators."
  },
  @{
    File = "video-demo/audio/06_coordinator_checkin.wav"
    Text = "Our third stakeholder is the gate coordinator at the venue door. Logging in as Preeti Coordinator, we open the check-in terminal. The coordinator can scan attendee QR codes in real-time using their device camera or search the roster. When the attendee's ticket is scanned, DynamoDB transitions the ticket from ACTIVE to CHECKED_IN in milliseconds. If the same ticket is scanned again, Marque immediately blocks it, preventing duplicate admission."
  },
  @{
    File = "video-demo/audio/07_conclusion.wav"
    Text = "Marque has been verified through 195 automated backend unit tests and 20 frontend integration suites, achieving a 100% pass rate in GitHub Actions CI. Operating entirely within the AWS Free Tier with zero idle costs and advancing UN Sustainable Development Goals 9, 12, and 4, Marque delivers a modern, resilient foundation for campus event management. Thank you."
  }
)

foreach ($item in $scripts) {
  Write-Host "Synthesizing $($item.File)..."
  $synth.SetOutputToWaveFile($item.File)
  $synth.Speak($item.Text)
}

$synth.Dispose()
Write-Host "All audio files synthesized successfully!"
